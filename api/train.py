"""
VyxHub ML Feed Training Endpoint
Vercel Serverless Function (Python)

Trains a logistic regression model on user engagement data and writes
learned weights to the model_weights table in Supabase.

Usage:
  POST /api/train
  Authorization: Bearer <TRAIN_API_KEY>
  Body (optional JSON):
    { "days": 30, "limit": 50000, "activate": false }

Environment Variables Required:
  SUPABASE_URL         - Supabase project URL
  SUPABASE_SERVICE_KEY - Supabase service role key (full access)
  TRAIN_API_KEY        - Secret key for authenticating training requests

Returns:
  JSON with model version, accuracy, AUC, feature weights, and sample counts.
"""

from http.server import BaseHTTPRequestHandler
import json
import os

# Lazy imports for cold start optimization
np = None
LogisticRegression = None
cross_val_score = None
roc_auc_score = None
requests_lib = None


def _lazy_imports():
    global np, LogisticRegression, cross_val_score, roc_auc_score, requests_lib
    if np is None:
        import numpy
        np = numpy
    if LogisticRegression is None:
        from sklearn.linear_model import LogisticRegression as LR
        LogisticRegression = LR
    if cross_val_score is None:
        from sklearn.model_selection import cross_val_score as cvs
        cross_val_score = cvs
    if roc_auc_score is None:
        from sklearn.metrics import roc_auc_score as ras
        roc_auc_score = ras
    if requests_lib is None:
        import requests
        requests_lib = requests


SUPABASE_URL = os.environ.get('SUPABASE_URL', '')
SUPABASE_SERVICE_KEY = os.environ.get('SUPABASE_SERVICE_KEY', '')
TRAIN_API_KEY = os.environ.get('TRAIN_API_KEY', '')

FEATURE_NAMES = [
    'ln_engagement',
    'ln_affinity',
    'is_following',
    'is_subscribed',
    'content_pref',
    'velocity_ratio',
    'ln_friend_likes',
    'inv_age',
    'has_media',
    'topic_affinity',
]


def _supabase_headers():
    return {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': f'Bearer {SUPABASE_SERVICE_KEY}',
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
    }


def _rpc(function_name, params=None):
    """Call a Supabase RPC function via REST API."""
    resp = requests_lib.post(
        f'{SUPABASE_URL}/rest/v1/rpc/{function_name}',
        headers=_supabase_headers(),
        json=params or {},
        timeout=120,
    )
    resp.raise_for_status()
    return resp.json()


def _query(table, select='*', params=None):
    """Query a Supabase table via REST API."""
    url = f'{SUPABASE_URL}/rest/v1/{table}?select={select}'
    if params:
        for k, v in params.items():
            url += f'&{k}={v}'
    resp = requests_lib.get(url, headers=_supabase_headers(), timeout=30)
    resp.raise_for_status()
    return resp.json()


def _insert(table, rows):
    """Insert rows into a Supabase table via REST API."""
    resp = requests_lib.post(
        f'{SUPABASE_URL}/rest/v1/{table}',
        headers=_supabase_headers(),
        json=rows,
        timeout=30,
    )
    resp.raise_for_status()
    return resp


def train_model(days=30, limit=50000, activate=False):
    """
    Full training pipeline:
    1. Export labeled training data from Supabase
    2. Build feature matrix + label vector
    3. Train logistic regression
    4. Write weights to model_weights table
    5. Optionally activate the new version
    """
    _lazy_imports()

    # 1. Fetch training data
    data = _rpc('export_training_data', {'p_days': days, 'p_limit': limit})

    if not data or len(data) < 50:
        return {
            'error': f'Insufficient training data: {len(data) if data else 0} samples (need >= 50)',
            'hint': 'Users need to browse the feed for a while to generate impression data. '
                    'Each (user, post) impression with known engagement label = 1 training sample.',
        }

    # 2. Build feature matrix and labels
    X = []
    y = []
    skipped = 0

    for row in data:
        try:
            features = [float(row.get(f, 0) or 0) for f in FEATURE_NAMES]
            label = 1 if row.get('engaged') else 0
            X.append(features)
            y.append(label)
        except (TypeError, ValueError):
            skipped += 1
            continue

    X = np.array(X, dtype=np.float64)
    y = np.array(y, dtype=np.int32)

    # Handle NaN/Inf
    X = np.nan_to_num(X, nan=0.0, posinf=10.0, neginf=-10.0)

    n_positive = int(y.sum())
    n_negative = int(len(y) - n_positive)

    if n_positive < 10 or n_negative < 10:
        return {
            'error': f'Imbalanced data: {n_positive} positive, {n_negative} negative (need >= 10 each)',
            'hint': 'Need more engagement events (likes/comments/bookmarks) on viewed posts.',
        }

    # 3. Train logistic regression
    # class_weight='balanced' handles imbalanced engagement data
    model = LogisticRegression(
        C=1.0,
        max_iter=1000,
        solver='lbfgs',
        class_weight='balanced',
        random_state=42,
    )
    model.fit(X, y)

    # 4. Evaluate
    y_prob = model.predict_proba(X)[:, 1]
    train_auc = float(roc_auc_score(y, y_prob))

    # Cross-validated AUC (if enough data)
    cv_auc = None
    if len(y) >= 200:
        try:
            cv_scores = cross_val_score(model, X, y, cv=5, scoring='roc_auc')
            cv_auc = float(np.mean(cv_scores))
        except Exception:
            cv_auc = None

    train_accuracy = float(model.score(X, y))

    # 5. Extract weights
    bias = float(model.intercept_[0])
    weights = {name: float(w) for name, w in zip(FEATURE_NAMES, model.coef_[0])}

    # 6. Get current max version
    versions = _query(
        'model_weights',
        select='version',
        params={
            'model_name': 'eq.feed_v1',
            'order': 'version.desc',
            'limit': '1',
        },
    )
    current_version = versions[0]['version'] if versions else 0
    new_version = current_version + 1

    # 7. Write weights to model_weights table
    weight_rows = [{
        'model_name': 'feed_v1',
        'feature_name': 'bias',
        'weight': bias,
        'version': new_version,
        'is_active': activate,
    }]
    for fname, w in weights.items():
        weight_rows.append({
            'model_name': 'feed_v1',
            'feature_name': fname,
            'weight': w,
            'version': new_version,
            'is_active': activate,
        })

    # If activating, deactivate old versions first
    if activate:
        _rpc('activate_model_version', {
            'p_model_name': 'feed_v1',
            'p_version': -1,  # deactivate all
        })
        # Set new version active
        for row in weight_rows:
            row['is_active'] = True

    _insert('model_weights', weight_rows)

    # If activating, ensure correct version is active
    if activate:
        _rpc('activate_model_version', {
            'p_model_name': 'feed_v1',
            'p_version': new_version,
        })

    return {
        'success': True,
        'version': new_version,
        'activated': activate,
        'samples': len(y),
        'positive_samples': n_positive,
        'negative_samples': n_negative,
        'skipped_rows': skipped,
        'train_accuracy': round(train_accuracy, 4),
        'train_auc': round(train_auc, 4),
        'cv_auc': round(cv_auc, 4) if cv_auc else None,
        'weights': {
            'bias': round(bias, 6),
            **{k: round(v, 6) for k, v in weights.items()},
        },
    }


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        # Auth check
        auth = self.headers.get('Authorization', '')
        if not TRAIN_API_KEY or auth != f'Bearer {TRAIN_API_KEY}':
            self.send_response(401)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'error': 'Unauthorized'}).encode())
            return

        # Parse body
        content_length = int(self.headers.get('Content-Length', 0))
        body = {}
        if content_length > 0:
            try:
                body = json.loads(self.rfile.read(content_length))
            except json.JSONDecodeError:
                pass

        days = body.get('days', 30)
        limit = body.get('limit', 50000)
        activate = body.get('activate', False)

        try:
            result = train_model(days=days, limit=limit, activate=activate)
            status = 200 if result.get('success') or result.get('error') else 500
            if result.get('error'):
                status = 400
        except Exception as e:
            result = {'error': str(e)}
            status = 500

        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(result, indent=2).encode())

    def do_GET(self):
        """Health check / info endpoint."""
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps({
            'service': 'VyxHub ML Feed Training',
            'method': 'POST /api/train',
            'auth': 'Bearer <TRAIN_API_KEY>',
            'body': {
                'days': 'Training window in days (default: 30)',
                'limit': 'Max training samples (default: 50000)',
                'activate': 'Auto-activate model after training (default: false)',
            },
        }).encode())
