# Key Technical Learnings — Phase 24: High-Performance 4D Sequence & Kinetic Onboarding UI

Dokumen catatan pembelajaran teknis utama (*Key Technical Learnings*) dari pengerjaan **Phase 24**.

---

## 💡 Key Technical Learnings & Best Practices

### 1. The Danger of CSS Ancestor `overflow` Traps on `position: sticky`
* **Pelajaran Utamanya:** Dalam standar CSS (Blink/WebKit Engine), menerapkan `overflow: hidden`, `overflow-x: hidden`, atau `overflow-y: hidden` pada elemen leluhur mana pun (seperti `html`, `body`, atau `<main>`) akan memutus konteks scroll viewport bawaan. Hal ini menyebabkan elemen anak bertipe `position: sticky; top: 0` gagal menempel di layar dan malah terdorong naik bersama dokumen.
* **Solusinya:** Pastikan `html` dan `body` di `globals.css` memiliki `overflow: visible` (tanpa `overflow-x: hidden` global). Jika memerlukan pemotongan elemen meluap secara horizontal, terapkan `overflow-x: hidden` secara terisolasi hanya pada blok sub-kontainer spesifik yang membutuhkan.

### 2. Canvas 2D Transform Matrix Accumulation Bug in High-DPI / Retina Displays
* **Pelajaran Utamanya:** Ketika menggambar pada kanvas HTML5 2D dengan Device Pixel Ratio scaling (`ctx.scale(dpr, dpr)`), pemanggilan `ctx.scale()` tanpa mereset matriks transformasi terlebih dahulu akan menyebabkan nilai skala terakumulasi secara eksponensial di setiap iterasi *frame/resize*. Efek visualnya: kanvas menciut ke pojok atas dan menyisakan rongga hitam kosong (*blank space*) di 80% area layar bawah.
* **Solusinya:** Selalu reset matriks transformasi kanvas ke matriks identitas sebelum memanggil `ctx.scale()`:
  ```ts
  ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset transform matrix to identity
  ctx.scale(dpr, dpr);                 // Apply Retina device pixel ratio scaling
  ```

### 3. Aspect-Ratio Cover Math for Full-Viewport Canvas Render
* **Pelajaran Utamanya:** Untuk memastikan gambar kanvas memenuhi 100% layar (`100vw × 100vh`) pada berbagai rasio layar (dari HP hingga ultra-wide 4K) tanpa distorsi atau garis hitam di tepi:
  ```ts
  const imgWidth = img.naturalWidth || 1920;
  const imgHeight = img.naturalHeight || 1080;
  const scale = Math.max(cssWidth / imgWidth, cssHeight / imgHeight);
  const drawWidth = imgWidth * scale;
  const drawHeight = imgHeight * scale;
  const x = (cssWidth - drawWidth) / 2;
  const y = (cssHeight - drawHeight) / 2;
  ctx.drawImage(img, x, y, drawWidth, drawHeight);
  ```

### 4. High-Performance Frame Preloading & Memory Safety
* **Pelajaran Utamanya:** Me-preload 121 frame gambar berformat JPG (total ~12 MB) langsung ke dalam memori JavaScript array (`Image[]`) saat komponen di-mount memastikan scrubbing frame berjalan instan pada 60 FPS tanpa jeda request HTTP di tengah *scroll*.
* **Offloading Memory:** Menggunakan `IntersectionObserver` untuk memantau visibilitas kontainer dan menghentikan `requestAnimationFrame` loop saat kanvas berada di luar *viewport* menghemat siklus CPU/GPU secara signifikan.

---

## 🛠️ Summary of Refactored Files

| File Path | Functional Role |
| :--- | :--- |
| [`frontend/app/globals.css`](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/app/globals.css) | Perbaikan `html, body` overflow & penambahan scrollbar dark glassmorphism 6px. |
| [`frontend/components/onboard/ImageSequenceCanvas.tsx`](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/components/onboard/ImageSequenceCanvas.tsx) | Kanvas 121-frame 60 FPS, Retina DPR scaling 2.5x, transform reset guard, & sticky pinning lock. |
| [`frontend/components/onboard/OnboardHero.tsx`](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/components/onboard/OnboardHero.tsx) | Hero section terbuka dengan video 3D globe 95% vivid & lencana kinetik frasa utuh. |
| [`frontend/components/onboard/OnboardingHome.tsx`](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/components/onboard/OnboardingHome.tsx) | Komposisi landing page onboarding & pembersihan `overflow-x-hidden` dari tag `<main>`. |
| [`frontend/app/layout.tsx`](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/app/layout.tsx) | Integrasi favicon `/logo_petanadi.png` pada metadata aplikasi. |
