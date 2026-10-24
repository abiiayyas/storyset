# Keputusan teknis

Catatan kenapa sesuatu dibuat begitu. Sebagian besar lahir dari bug nyata, jadi baca dulu sebelum mengubah
bagian terkait. Tambahkan entri baru di akhir setiap kali membuat keputusan penting.

### Narasi direkam satu kali utuh, lalu dipotong per adegan
TTS yang dipanggil per klip menghasilkan suara dan intonasi yang berbeda-beda. Satu rekaman utuh lalu dipotong
membuat suaranya konsisten. Jangan menambah tombol "buat suara" per klip.

### Whisper tanpa `--prompt`, dengan DTW
Naskah yang dikirim sebagai prompt membuat Whisper berhalusinasi: dalam uji coba, Whisper mengulang "tidak tidak
tidak..." puluhan kali. Caption klip 1 selesai 2 detik lebih cepat dari suaranya, dan kata-kata awal klip lain
tertumpuk di detik 0. Waktu per kata bawaan whisper.cpp juga kurang presisi. Dari tiga cara yang diuji,
`-nfa -dtw small` tanpa prompt paling akurat: caption hanya meleset sekitar 0,1–0,2 detik dari suara (diuji pada
proyek nyata). Ejaan caption tetap dari naskah (`align.ts`); dari Whisper hanya diambil waktunya.

### Potongan adegan mengikuti kata
Dengan Whisper, adegan dipotong di jeda antara kata terakhir satu adegan dan kata pertama adegan berikutnya
(`cutsFromWords`), jadi potongan tidak pernah jatuh di tengah kata. Tanpa waktu kata, `chooseCuts` memilih dari
jeda yang dideteksi FFmpeg. Gemini diberi `<long pause>` di antara adegan supaya jedanya jelas. ElevenLabs
memakai waktu kata dari API-nya sendiri.

### Sorotan caption bertahan di jeda antar kata
Di jeda antar kata, sorotan tetap di kata terakhir yang sudah diucapkan (`captionAt`), sama seperti ekspor.
Dulu sorotan lompat ke kata terakhir baris lalu balik lagi, sehingga terlihat berkedip.

### Segmen ekspor dibulatkan ke frame + 2 frame cadangan
`xfade` menghentikan seluruh video kalau klip pertama habis sebelum offset transisi. Dengan transisi `cut`
(1 frame) dan durasi klip yang tidak pas di frame, gambar video pernah berhenti setelah klip 1 sementara audio
tetap jalan. `planSegments` membulatkan awal klip ke frame utuh dan menambah 2 frame cadangan.

### Gerak kamera di ekspor memakai filter `perspective`, bukan `zoompan`
`zoompan` membulatkan potongan gambar ke piksel bulat setiap frame, sehingga gerak lambat bergoyang 0,6–0,7 px
per frame (terlihat bergetar, terutama garis tipis). `perspective` (sense=source, cubic) bergerak pecahan piksel:
getarannya 0,02–0,16 px dengan kecepatan hampir sama. Gambar diproses di resolusi aslinya (1×–2× output) lalu
diperkecil, supaya tetap tajam. Catatan: penghitung frame `perspective` mulai dari 1, jadi rumusnya memakai `(on-1)`.

### Kotak caption rounded digambar sendiri
libass hanya bisa membuat kotak bersudut siku. Kotak rounded digambar sebagai drawing ASS di layer bawah teks.
Lebarnya dihitung dari metrik file font (`fontMetrics.ts`), dan baris dipecah dengan fungsi yang sama dengan
pratinjau (`layoutCaptionLines`).

### Ukuran caption memakai metrik `cell` per font
libass mengukur ukuran font dengan winAscent+winDescent, CSS dengan em. Tanpa konversi, caption di ekspor hanya
sekitar 57% ukuran pratinjau. Setiap font di `CAPTION_FONTS` punya nilai `cell` hasil pengukuran file TTF-nya.

### Pratinjau menjaga tiga klip tetap terpasang
Membuat elemen `<video>` baru setiap pindah klip sempat menampilkan frame pertama video (atau poster) sebelum
seek. Akibatnya ada kilasan di sambungan potongan dan di transisi. Klip sebelum/sekarang/sesudah selalu
terpasang dalam urutan timeline. Klip berikutnya menunggu di titik mulainya, dan langsung diputar tanpa seek
ulang (seek ulang menahan video sekitar 150 ms).

### Video overlay hardware dimatikan
Di Windows, Chromium menyerahkan video ke overlay hardware (DirectComposition) yang membulatkan posisi dan
ukuran ke piksel bulat. Gerak kamera di atas video jadi gemetar di pratinjau, padahal gambar halus.
Switch `disable-direct-composition-video-overlays` dan opasitas 0,999 untuk video yang bergerak menahan video
di jalur render biasa. (Pemilik aplikasi masih melihat getaran di pratinjau; lihat masalah-diketahui.md.)

### Suara milik klipnya ("klip tertaut")
Seperti suara bawaan klip video di editor lain: suara bisa dipotong dan digeser di dalam klip, dan terpotong di
akhir klip. Ini menjaga sinkron naskah per adegan dan rekam ulang narasi tetap sederhana.

### Potong klip ikut membelah suara dan naskah
Saat klip dibelah, file suara dipotong di jeda antar kata terdekat, dan teks narasinya dibagi
(`splitNarration`). Dengan begitu tiap bagian punya aset dan naskah yang cocok (tidak dianggap basi), dan bisa
direkam ulang sendiri. Bagian pertama diberi transisi `cut` agar sambungannya mulus.

### Panel Transisi, bukan popup
Popup di timeline menutupi pratinjau, padahal pengguna ingin melihat contoh transisinya. Tombol sambungan
membuka panel di kanan, lalu pratinjau memutar sambungan itu berulang-ulang (audition).

### Prompt visual berlabel dan baris Wardrobe
Model gambar tidak membaca naskah. Prompt yang kurang spesifik menghasilkan latar Bumi dan alien untuk cerita di
Mars, dan baju astronot di semua adegan. Setiap prompt kini menyebut dunia/era dengan jelas, orang disebut
"human", dan baju per adegan ditulis di baris `Wardrobe` (bawaan lembar karakter atau custom).

### Prompt video selalu melarang musik
Beberapa model video (Veo, Grok, MiniMax) membuat musik sendiri tanpa saklar. Setiap prompt diakhiri `NO_MUSIC`,
dan audio dimatikan lewat parameter kalau modelnya punya. Audio dari file video tidak pernah dipakai di ekspor.

### Kunci API dienkripsi safeStorage, kunci kripto dibuat saat startup
Kunci kriptografi `safeStorage` baru tertulis ke `Local State` sekitar 10 detik setelah dibuat. Membuatnya saat
startup (`warmUpEncryption`) mencegah kunci API tidak terbaca setelah aplikasi ditutup paksa.

### YouTube embed diberi Referer berisi ID aplikasi
Halaman dari `file://` tidak mengirim Referer, dan YouTube menolak embed tanpa identitas (Error 153). Header
ditambahkan hanya untuk `https://www.youtube.com/embed/*`.

### Scene motion: Remotion dirender ke MP4 biasa
Klip bertemplat (judul, poin, angka, grafik) digambar oleh komponen React di `src/remotion/`. Pratinjau di editor
memakai `@remotion/player` dan ekspor memakai `@remotion/renderer` dengan komponen yang sama, jadi hasilnya identik.
Hasil render disimpan sebagai aset video klip (`videoAssetId`, `motionType: 'video'`), jadi timeline, trim, transisi,
caption, dan ekspor FFmpeg tidak tahu bedanya dengan video AI. Spesifikasi scene (`Clip.graphic`) tetap disimpan,
sehingga scene bisa diedit lalu dirender ulang. Render dianggap usang kalau `graphicKey` (spesifikasi, jumlah frame,
rasio) berbeda dengan yang tercatat di `meta` aset; naikkan `GRAPHIC_VERSION` kalau tampilan scene berubah.
- **LLM hanya menulis JSON**, bukan kode. `sanitizeGraphic` memotong dan memvalidasi semuanya. Kode buatan LLM tidak
  pernah dijalankan.
- **Chrome Headless Shell ikut dipaketkan** (±217 MB terurai). Biner Electron tidak bisa dipakai sebagai
  `browserExecutable` Remotion (koneksi habis waktu setelah 25 detik), jadi browser terpisah memang diperlukan.
- **Bundle dibuat saat build**, bukan saat jalan: webpack tidak bisa jalan di dalam asar. Saat pengembangan, main
  membuatnya sendiri lewat `scripts/prepare-remotion.mjs --bundle` kalau `src/remotion` lebih baru.
- **Lisensi:** Remotion gratis untuk individu dan tim sampai 3 orang (termasuk komersial). Membagikan aplikasi ini
  ke perusahaan 4 orang ke atas bisa memerlukan lisensi perusahaan; syaratnya belum jelas untuk aplikasi desktop,
  tanyakan ke hi@remotion.dev sebelum distribusi luas.

### Gambar dan video tidak terkunci ke Higgsfield
Gejala awal: gambar dan video "selalu ke Higgsfield" walau Fal.ai, Gemini, dan CLI sudah terhubung. Penyebabnya bukan
percabangan yang salah, tapi model bawaan proyek baru adalah model Higgsfield, dan video memang hanya punya jalur
Higgsfield. Keputusannya:
- Jalur ditentukan satu tempat, `providerOfModel` (awalan id model). Jangan membuat penentuan penyedia baru di renderer
  atau di `generation.ts`.
- Model bawaan proyek baru dipilih dari penyedia yang kuncinya valid (`modelsForNewProject`), bukan konstanta. Model
  yang pernah dipilih pengguna (`settings.imageModel`/`videoModel`) selalu menang. `DEFAULT_IMAGE_MODEL` dan
  `DEFAULT_VIDEO_MODEL` tinggal jadi cadangan terakhir saat tidak ada penyedia siap, dan untuk id model yang tidak dikenal.
- Model yang dimatikan pembuatnya dipetakan lewat `RENAMED_MODELS`. Tanpa itu, `getImageModel` jatuh ke model Higgsfield
  bawaan, yang menyamar sebagai "selalu ke Higgsfield" (kasus nyata: `gemini/imagen-3.0-generate-002`).
- Harga penyedia selain Higgsfield adalah harga daftar di katalog (`usd`), diverifikasi dari dokumentasi pada Okt 2026.
  Hanya Higgsfield punya endpoint estimasi.
- Gambar awal video Fal dikirim sebagai data URI, bukan diunggah ke Higgsfield, supaya video Fal tidak butuh kunci
  Higgsfield. Video Fal tidak bisa dilanjutkan setelah aplikasi ditutup (tidak ada `remote_id` yang disimpan); job-nya
  ditandai gagal dan bisa diulang.
