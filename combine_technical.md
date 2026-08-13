Skenario Kebutuhan,Cara yang Dipakai,Alasan / Benefit
User cuma cari rute A ke B,Cara Lama (Dijkstra),"Cepat, hemat biaya, tak butuh GPU."
Optimasi 100 Truk Pengiriman,Cara Baru (cuOpt + FourCastNet),Butuh daya komputasi GPU & estimasi cuaca makro.
API cuOpt/DeepSeek Limit 40 RPM,Fallback (OR-Tools + Gemini/CPU),"Aplikasi tetap jalan, user experience tidak terganggu."
Prediksi Macet + Hujan Lokal,Digabung (FourCastNet + TFI/Histori),Akurasi maksimal (Gabungan fisik makro + pola historis mikro).