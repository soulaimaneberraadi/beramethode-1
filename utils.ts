
export const compressImage = async (file: File, maxWidth = 600, quality = 0.5): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height *= maxWidth / width;
            width = maxWidth;
          }
        } else {
          if (height > maxWidth) {
            width *= maxWidth / height;
            height = maxWidth;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            reject(new Error("Canvas context not available"));
            return;
        }
        ctx.fillStyle = 'white'; // Prevent transparency turning black in JPEG
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        
        // Export as JPEG with reduced quality
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = (error) => reject(error);
    };
    reader.onerror = (error) => reject(error);
  });
};

const STORAGE_BUCKET = 'bera-assets';

// Le bucket `bera-assets` est privé (public:false côté serveur) → getPublicUrl
// renvoie une URL cassée et la photo « disparaît » à l'affichage. On garde donc
// le stockage local (data-URL). Repasser à true seulement si le bucket est rendu
// public + policies OK dans Supabase.
const USE_STORAGE_BUCKET = false;

const imgUrlCache = new Map<string, string>();

/**
 * Upload an image file to Supabase Storage and return the public URL.
 * If the file is already a URL (not base64), returns it as-is.
 * Falls back to compressed data-URL if upload fails.
 */
export const uploadImageToStorage = async (
  file: File,
  maxWidth = 1600,
  quality = 0.88
): Promise<string> => {
  // Bucket désactivé : on stocke la photo en data-URL compressée (fiable, s'affiche
  // toujours). Taille bornée (≤1200px / q0.82) pour ne pas gonfler la synchro cloud.
  if (!USE_STORAGE_BUCKET) {
    return compressImage(file, Math.min(maxWidth, 1200), Math.min(quality, 0.82));
  }
  // If it's already a URL, return as-is
  const url = URL.createObjectURL(file);

  // Generate deterministic filename via SHA-256
  let filename: string;
  try {
    const arrayBuffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
    const hex = Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
      .slice(0, 32);
    const ext = file.type.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg';
    filename = `${hex}.${ext}`;
  } catch {
    const ext = file.type.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg';
    filename = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  }

  // Check cache
  if (imgUrlCache.has(filename)) {
    URL.revokeObjectURL(url);
    return imgUrlCache.get(filename)!;
  }

  try {
    // Dynamic import to avoid issues if supabaseClient is not initialized
    const { supabase } = await import('./src/lib/supabaseClient');

    // Check if already uploaded (HEAD request)
    const { data: urlData } = supabase.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(filename);
    const publicUrl = urlData.publicUrl;
    const headOk = await fetch(publicUrl, { method: 'HEAD' })
      .then(r => r.ok)
      .catch(() => false);
    if (headOk) {
      imgUrlCache.set(filename, publicUrl);
      URL.revokeObjectURL(url);
      return publicUrl;
    }

    // Upload
    const { error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(filename, file, {
        contentType: file.type || 'image/jpeg',
        upsert: true,
      });

    if (!error) {
      imgUrlCache.set(filename, publicUrl);
      URL.revokeObjectURL(url);
      return publicUrl;
    }
    console.warn('[uploadImageToStorage] Upload failed:', error);
  } catch (e) {
    console.warn('[uploadImageToStorage] Error:', e);
  }

  // Fallback: compress and return data-URL
  URL.revokeObjectURL(url);
  return compressImage(file, maxWidth, quality);
};
