import React, { useState, useEffect } from 'react';
import { Download, Smartphone, X, Sparkles, Share } from 'lucide-react';

export default function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSTip, setShowIOSTip] = useState(false);

  useEffect(() => {
    // Check if already in standalone mode (installed)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    if (isStandalone) {
      return;
    }

    // Check if dismissed before
    const isDismissed = sessionStorage.getItem('finflow_pwa_dismissed');
    if (isDismissed) return;

    // Detect iOS
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(isIosDevice);

    // Standard Android / Chrome / Edge install prompt
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // If on iOS and not standalone, show optional prompt after short delay
    if (isIosDevice && !isStandalone) {
      const timer = setTimeout(() => {
        setShowPrompt(true);
      }, 3000);
      return () => clearTimeout(timer);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (isIOS) {
      setShowIOSTip(true);
      return;
    }

    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setShowPrompt(false);
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    setShowIOSTip(false);
    sessionStorage.setItem('finflow_pwa_dismissed', 'true');
  };

  if (!showPrompt) return null;

  return (
    <div className="pwa-install-banner">
      <div className="pwa-banner-content">
        <div className="pwa-banner-left">
          <div className="pwa-app-icon">
            <Smartphone size={18} />
          </div>
          <div className="pwa-text-wrap">
            <strong className="pwa-title">Pasang FinFlow App (PWA)</strong>
            <span className="pwa-desc">Akses cepat dari layar utama & offline gratis</span>
          </div>
        </div>

        <div className="pwa-banner-actions">
          <button className="btn btn-sm btn-primary pwa-btn-install" onClick={handleInstallClick}>
            <Download size={13} />
            <span>Pasang</span>
          </button>
          <button className="btn-icon-subtle pwa-btn-close" onClick={handleDismiss} title="Tutup">
            <X size={15} />
          </button>
        </div>
      </div>

      {showIOSTip && (
        <div className="pwa-ios-tip">
          <p className="text-2xs">
            👉 Untuk iPhone/iPad: Tekan tombol <strong>Share</strong> (<Share size={11} className="inline-icon" />) di Safari, lalu pilih <strong>'Tambahkan ke Layar Utama' (Add to Home Screen)</strong>.
          </p>
        </div>
      )}
    </div>
  );
}
