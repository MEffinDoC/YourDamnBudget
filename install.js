// Handles PWA install prompt and a manual Install button in Settings.
let deferredPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  // If settings page is open and button exists, enable it
  const btn = document.getElementById('installBtn');
  if (btn) btn.disabled = false;
});

window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
});

export async function triggerInstall(){
  try{
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      deferredPrompt = null;
      return outcome;
    } else {
      // Fallback: show native “Add to Home screen” UI hints
      alert('Tip: In Chrome, open menu ••• → Add to Home screen');
      return 'dismissed';
    }
  }catch(e){
    console.warn('Install failed', e);
    return 'failed';
  }
}