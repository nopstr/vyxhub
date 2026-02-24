const fs = require('fs');
let content = fs.readFileSync('src/pages/profile/ProfilePage.jsx', 'utf8');

// Add import
content = content.replace(
  "import SubscribeModal from '../../components/SubscribeModal'",
  "import SubscribeModal from '../../components/SubscribeModal'\nimport ImageModal from '../../components/ui/ImageModal'"
);

// Add state
content = content.replace(
  "const [showSubscribeModal, setShowSubscribeModal] = useState(false)",
  "const [showSubscribeModal, setShowSubscribeModal] = useState(false)\n  const [selectedImage, setSelectedImage] = useState(null)"
);

// Update banner
content = content.replace(
  '<img src={profile.banner_url} alt="" className="w-full h-full object-cover" />',
  '<img src={profile.banner_url} alt="" className="w-full h-full object-cover cursor-pointer" onClick={() => setSelectedImage([{ url: profile.banner_url }])} />'
);

// Update avatar
content = content.replace(
  'className="border-4 border-[#050505] rounded-3xl"\n            />',
  'className="border-4 border-[#050505] rounded-3xl"\n            onClick={profile.avatar_url ? () => setSelectedImage([{ url: profile.avatar_url }]) : undefined}\n          />'
);

// Add ImageModal component
content = content.replace(
  '        {showSubscribeModal && (\n          <SubscribeModal',
  '        {selectedImage && (\n          <ImageModal\n            images={selectedImage}\n            onClose={() => setSelectedImage(null)}\n          />\n        )}\n\n        {showSubscribeModal && (\n          <SubscribeModal'
);

fs.writeFileSync('src/pages/profile/ProfilePage.jsx', content, 'utf8');
