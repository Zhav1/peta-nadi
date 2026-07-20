# AUDIT NOTES - PetaNadi QA

## Bug & Runtime Issues
1. Disruption Hotspots atau nodes di map nya kadang bug, saat kita geser map dia juga ikut bergeser yang seharusnya padahal tetap di titik map nya. selain itu kan ini 4d map ya, jadi bisa di puter puter globe nya, nah titiknya itu ga standby di lokasi yang ditetapkan alhasil dia ikut berputar dan melayang (harus di refresh buat balik normal)
2. Tombol SIMULATE DISRUPTION belum bisa digunakan, saat di klik status berubah "DRAWING MODE ACTIVE..." Tapi Tidak Bisa Menggambar, kemungkinan kesalahan di event listener nya. Akibatnya, kursor tidak berubah menjadi alat pen/gambar poligon dan kanvas tidak memproses click-and-drag dari mouse.
3. pada page analytics, simulation, reports masi ada beberapa component yang bertabrakan UI nya tidak ada margin dan paddingnya, analisa lebih lanjut
4. ssat klik "run demo" hasilnya page-de21a863d0d8e585.js:1 Backend demo API call failed, activating client-side offline demo runner: Error: API /api/demo/start → 500
    at a (page-de21a863d0d8e585.js:1:90124)
    at async page-de21a863d0d8e585.js:1:20559
(anonymous) @ page-de21a863d0d8e585.js:1
await in (anonymous)
onClick @ page-de21a863d0d8e585.js:1
a_ @ fd9d1056-e59ed79977a2f428.js:1
aR @ fd9d1056-e59ed79977a2f428.js:1
(anonymous) @ fd9d1056-e59ed79977a2f428.js:1
sF @ fd9d1056-e59ed79977a2f428.js:1
sM @ fd9d1056-e59ed79977a2f428.js:1
(anonymous) @ fd9d1056-e59ed79977a2f428.js:1
o4 @ fd9d1056-e59ed79977a2f428.js:1
iV @ fd9d1056-e59ed79977a2f428.js:1
sU @ fd9d1056-e59ed79977a2f428.js:1
uR @ fd9d1056-e59ed79977a2f428.js:1
uM @ fd9d1056-e59ed79977a2f428.js:1
page-de21a863d0d8e585.js:1  GET http://localhost:8000/api/demo/status/belawan-demo-offline-309 404 (Not Found)
a @ page-de21a863d0d8e585.js:1
status @ page-de21a863d0d8e585.js:1
(anonymous) @ page-de21a863d0d8e585.js:1
setInterval
(anonymous) @ page-de21a863d0d8e585.js:1
aW @ fd9d1056-e59ed79977a2f428.js:1
oe @ fd9d1056-e59ed79977a2f428.js:1
ol @ fd9d1056-e59ed79977a2f428.js:1
or @ fd9d1056-e59ed79977a2f428.js:1
ol @ fd9d1056-e59ed79977a2f428.js:1
or @ fd9d1056-e59ed79977a2f428.js:1
ol @ fd9d1056-e59ed79977a2f428.js:1
or @ fd9d1056-e59ed79977a2f428.js:1
ol @ fd9d1056-e59ed79977a2f428.js:1
or @ fd9d1056-e59ed79977a2f428.js:1
ol @ fd9d1056-e59ed79977a2f428.js:1
or @ fd9d1056-e59ed79977a2f428.js:1
ol @ fd9d1056-e59ed79977a2f428.js:1
or @ fd9d1056-e59ed79977a2f428.js:1
ol @ fd9d1056-e59ed79977a2f428.js:1
or @ fd9d1056-e59ed79977a2f428.js:1
ol @ fd9d1056-e59ed79977a2f428.js:1
or @ fd9d1056-e59ed79977a2f428.js:1
ol @ fd9d1056-e59ed79977a2f428.js:1
or @ fd9d1056-e59ed79977a2f428.js:1
ol @ fd9d1056-e59ed79977a2f428.js:1
or @ fd9d1056-e59ed79977a2f428.js:1
ol @ fd9d1056-e59ed79977a2f428.js:1
or @ fd9d1056-e59ed79977a2f428.js:1
ol @ fd9d1056-e59ed79977a2f428.js:1
or @ fd9d1056-e59ed79977a2f428.js:1
ol @ fd9d1056-e59ed79977a2f428.js:1
or @ fd9d1056-e59ed79977a2f428.js:1
ol @ fd9d1056-e59ed79977a2f428.js:1
or @ fd9d1056-e59ed79977a2f428.js:1
ol @ fd9d1056-e59ed79977a2f428.js:1
or @ fd9d1056-e59ed79977a2f428.js:1
ol @ fd9d1056-e59ed79977a2f428.js:1
or @ fd9d1056-e59ed79977a2f428.js:1
ol @ fd9d1056-e59ed79977a2f428.js:1
or @ fd9d1056-e59ed79977a2f428.js:1
ol @ fd9d1056-e59ed79977a2f428.js:1
or @ fd9d1056-e59ed79977a2f428.js:1
ol @ fd9d1056-e59ed79977a2f428.js:1
or @ fd9d1056-e59ed79977a2f428.js:1
ol @ fd9d1056-e59ed79977a2f428.js:1
or @ fd9d1056-e59ed79977a2f428.js:1
ol @ fd9d1056-e59ed79977a2f428.js:1
or @ fd9d1056-e59ed79977a2f428.js:1
ol @ fd9d1056-e59ed79977a2f428.js:1
or @ fd9d1056-e59ed79977a2f428.js:1
ol @ fd9d1056-e59ed79977a2f428.js:1
or @ fd9d1056-e59ed79977a2f428.js:1
ol @ fd9d1056-e59ed79977a2f428.js:1
or @ fd9d1056-e59ed79977a2f428.js:1
ol @ fd9d1056-e59ed79977a2f428.js:1
or @ fd9d1056-e59ed79977a2f428.js:1
ol @ fd9d1056-e59ed79977a2f428.js:1
or @ fd9d1056-e59ed79977a2f428.js:1
ol @ fd9d1056-e59ed79977a2f428.js:1
or @ fd9d1056-e59ed79977a2f428.js:1
ol @ fd9d1056-e59ed79977a2f428.js:1
or @ fd9d1056-e59ed79977a2f428.js:1
ol @ fd9d1056-e59ed79977a2f428.js:1
or @ fd9d1056-e59ed79977a2f428.js:1
ol @ fd9d1056-e59ed79977a2f428.js:1
or @ fd9d1056-e59ed79977a2f428.js:1
ol @ fd9d1056-e59ed79977a2f428.js:1
or @ fd9d1056-e59ed79977a2f428.js:1
ol @ fd9d1056-e59ed79977a2f428.js:1
or @ fd9d1056-e59ed79977a2f428.js:1
ol @ fd9d1056-e59ed79977a2f428.js:1
or @ fd9d1056-e59ed79977a2f428.js:1
ol @ fd9d1056-e59ed79977a2f428.js:1
or @ fd9d1056-e59ed79977a2f428.js:1
ol @ fd9d1056-e59ed79977a2f428.js:1
or @ fd9d1056-e59ed79977a2f428.js:1
ol @ fd9d1056-e59ed79977a2f428.js:1
or @ fd9d1056-e59ed79977a2f428.js:1
ol @ fd9d1056-e59ed79977a2f428.js:1
or @ fd9d1056-e59ed79977a2f428.js:1
ol @ fd9d1056-e59ed79977a2f428.js:1
or @ fd9d1056-e59ed79977a2f428.js:1
ol @ fd9d1056-e59ed79977a2f428.js:1
or @ fd9d1056-e59ed79977a2f428.js:1
ol @ fd9d1056-e59ed79977a2f428.js:1
or @ fd9d1056-e59ed79977a2f428.js:1
ol @ fd9d1056-e59ed79977a2f428.js:1
or @ fd9d1056-e59ed79977a2f428.js:1
ol @ fd9d1056-e59ed79977a2f428.js:1
or @ fd9d1056-e59ed79977a2f428.js:1
ol @ fd9d1056-e59ed79977a2f428.js:1
id @ fd9d1056-e59ed79977a2f428.js:1
o @ fd9d1056-e59ed79977a2f428.js:1
M @ 117-902b8f75c68c4cfd.js:1
postMessage
l @ 117-902b8f75c68c4cfd.js:1
x @ 117-902b8f75c68c4cfd.js:1
(anonymous) @ 117-902b8f75c68c4cfd.js:1
nS @ fd9d1056-e59ed79977a2f428.js:1
nw @ fd9d1056-e59ed79977a2f428.js:1
(anonymous) @ fd9d1056-e59ed79977a2f428.js:1
117-902b8f75c68c4cfd.js:1 Failed to poll demo status: Error: API /api/demo/status/belawan-demo-offline-309 → 404
    at a (page-de21a863d0d8e585.js:1:90124)
    at async page-de21a863d0d8e585.js:1:22072

selain itu juga masih belum berfungsi dengan benar, habis di run demo memang muncul halaman mitigation nya terisi, tpi pas di run demo lagi dia hang. analisis lebih dalam
5. simulation ai advisor chatnya hanya bisa merespon dalam bahasa inggris harusnya multi language nyesuain dari request user, kalau user chat pakai indo responnya indo dll.
6. pop up masih berupa basic alert visual js.
7. pdf report export / generate masih belum bisa 
8. waktu di simulation page, tekan button assign parameters itu muncul popup "Assigned cargo routing parameters to BULOG depots."
9. route di map nya masih terlalu halusinasi, garis nya tidak jelas dll.
10. aku masih tidak paham sidebar sama bottom bar nya gimana konsepnya, di satu sisi mereka saling sinkron tapi disisi lain tidak sinkron, lalu saat di page selain map kan bottom bar gada, tapi side bar tetap ada yang malah malfungsi (gada fungsinya sama skali kecuali dari awal popup evidence, mitigation and economic udah terbuka dari awal) analisis lebih dalam.

## Fitur Baru
1. tambah kayak logo logo kendaraan gitu untuk logistik di map, jadikan ini pemantauan ya kita simulasi dulu dengan adanya kendaraan kendaraan yang bergerak itu tampil di map, baik pesawat, kapal, truck dll yang dibutuhkan sesuai ketentuan proposal yang ada di C:\Farras\DIGDAYA\peta-nadi\docs\Submission Tahap 2 (3) - compiled.md