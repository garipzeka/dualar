import tkinter as tk
from tkinter import ttk, messagebox, simpledialog, filedialog
import json
import os
import subprocess
import uuid

JSON_FILE = "dualar.json"

app_data = {
    "version": 2,
    "items": [],
    "lists": []
}

secili_liste_index = 0
aktif_dua_id = None

def load_data():
    global app_data, secili_liste_index
    if os.path.exists(JSON_FILE):
        try:
            with open(JSON_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, list):
                    app_data["items"] = data
                    app_data["lists"] = [{"id": "varsayilan", "name": "Varsayılan Liste", "items": data}]
                else:
                    app_data["items"] = data.get("items", [])
                    app_data["lists"] = data.get("lists", [])
        except Exception as e:
            messagebox.showerror("Hata", f"Dosya okunamadı: {e}")
            
    if not app_data["lists"]:
        app_data["lists"] = [{"id": "varsayilan", "name": "Varsayılan Liste", "items": []}]
        
    update_unique_items()
    secili_liste_index = 0

def update_unique_items():
    havuz_map = {p["id"]: p for p in app_data.get("items", [])}
    # Listelerdeki duaları da havuza dahil et / eşitle
    for lst in app_data["lists"]:
        for p in lst.get("items", []):
            havuz_map[p["id"]] = p
    app_data["items"] = list(havuz_map.values())

def save_data_to_file():
    update_unique_items()
    try:
        with open(JSON_FILE, "w", encoding="utf-8") as f:
            json.dump(app_data, f, ensure_ascii=False, indent=2)
    except Exception as e:
        messagebox.showerror("Hata", f"Dosya kaydedilemedi: {e}")

# --- GUI GÜNCELLEMELERİ ---

def guncelle_combo_listeler():
    liste_isimleri = [lst["name"] for lst in app_data["lists"]]
    combo_listeler['values'] = liste_isimleri
    if secili_liste_index >= 0 and secili_liste_index < len(liste_isimleri):
        combo_listeler.current(secili_liste_index)
    else:
        combo_listeler.set('')

def combo_secildi(event):
    global secili_liste_index
    idx = combo_listeler.current()
    if idx >= 0:
        secili_liste_index = idx
        guncelle_sag_tablo()
        form_temizle()

def guncelle_sol_tablo():
    for item in tree_havuz.get_children():
        tree_havuz.delete(item)
    for dua in app_data["items"]:
        # ID, Adı, Hedef
        tree_havuz.insert("", tk.END, iid="havuz_"+dua["id"], values=(dua.get("name", "İsimsiz"), dua.get("goal", 33), dua["id"]))

def guncelle_sag_tablo():
    for item in tree_liste.get_children():
        tree_liste.delete(item)
    if secili_liste_index < 0 or secili_liste_index >= len(app_data["lists"]):
        return
    lst = app_data["lists"][secili_liste_index]
    for index, dua in enumerate(lst.get("items", [])):
        # Benzersiz IID için index ekliyoruz, çünkü aynı dua listede birden fazla olabilir
        tree_liste.insert("", tk.END, iid=f"liste_{dua['id']}_{index}", values=(dua.get("name", "İsimsiz"), dua.get("goal", 33), dua["id"]))

def dua_secildi_sol(event):
    selection = tree_havuz.selection()
    if selection:
        dua_id = tree_havuz.item(selection[0], "values")[2]
        formu_doldur(dua_id)

def dua_secildi_sag(event):
    selection = tree_liste.selection()
    if selection:
        dua_id = tree_liste.item(selection[0], "values")[2]
        formu_doldur(dua_id)

def formu_doldur(dua_id):
    global aktif_dua_id
    aktif_dua_id = dua_id
    
    dua = next((d for d in app_data["items"] if d["id"] == dua_id), None)
    if not dua: return

    entry_id.config(state=tk.NORMAL)
    entry_id.delete(0, tk.END)
    entry_id.insert(0, dua["id"])
    entry_id.config(state="readonly")

    entry_ad.delete(0, tk.END)
    entry_ad.insert(0, dua.get("name", ""))

    text_okunus.delete("1.0", tk.END)
    text_okunus.insert("1.0", dua.get("text", ""))

    text_meal.delete("1.0", tk.END)
    text_meal.insert("1.0", dua.get("meaning", ""))

    entry_hedef.delete(0, tk.END)
    entry_hedef.insert(0, str(dua.get("goal", 33)))

def form_temizle():
    global aktif_dua_id
    aktif_dua_id = None
    entry_id.config(state=tk.NORMAL)
    entry_id.delete(0, tk.END)
    entry_id.config(state="readonly")
    entry_ad.delete(0, tk.END)
    text_okunus.delete("1.0", tk.END)
    text_meal.delete("1.0", tk.END)
    entry_hedef.delete(0, tk.END)

# --- AKSİYONLAR ---

def aktar_saga():
    selections = tree_havuz.selection()
    if not selections:
        messagebox.showwarning("Uyarı", "Sol taraftan en az bir dua seçin.")
        return
    if secili_liste_index < 0:
        return
        
    eklenen_sayisi = 0
    for sel in selections:
        dua_id = tree_havuz.item(sel, "values")[2]
        dua = next((d for d in app_data["items"] if d["id"] == dua_id), None)
        if dua:
            app_data["lists"][secili_liste_index]["items"].append(dua.copy())
            eklenen_sayisi += 1
            
    if eklenen_sayisi > 0:
        save_data_to_file()
        guncelle_sag_tablo()

def aktar_sola_cikar():
    selections = tree_liste.selection()
    if not selections:
        messagebox.showwarning("Uyarı", "Çıkarmak için sağ taraftaki listeden en az bir dua seçin.")
        return
        
    indexes_to_remove = []
    for sel in selections:
        index = int(sel.split("_")[-1])
        indexes_to_remove.append(index)
        
    # Sıralamayı tersine çevirerek silmeliyiz ki indeksler kaymasın
    indexes_to_remove.sort(reverse=True)
    
    lst = app_data["lists"][secili_liste_index]["items"]
    silinen_sayisi = 0
    for index in indexes_to_remove:
        if 0 <= index < len(lst):
            lst.pop(index)
            silinen_sayisi += 1
            
    if silinen_sayisi > 0:
        save_data_to_file()
        guncelle_sag_tablo()

def liste_yukari():
    selection = tree_liste.selection()
    if not selection: return
    index = int(selection[0].split("_")[-1])
    if index <= 0: return
    
    lst = app_data["lists"][secili_liste_index]["items"]
    lst[index], lst[index-1] = lst[index-1], lst[index]
    save_data_to_file()
    guncelle_sag_tablo()
    
    # Yeni pozisyonu seçili yap
    dua_id = lst[index-1]["id"]
    tree_liste.selection_set(f"liste_{dua_id}_{index-1}")

def liste_asagi():
    selection = tree_liste.selection()
    if not selection: return
    index = int(selection[0].split("_")[-1])
    lst = app_data["lists"][secili_liste_index]["items"]
    if index >= len(lst) - 1: return
    
    lst[index], lst[index+1] = lst[index+1], lst[index]
    save_data_to_file()
    guncelle_sag_tablo()
    
    dua_id = lst[index+1]["id"]
    tree_liste.selection_set(f"liste_{dua_id}_{index+1}")

def formu_kaydet():
    ad = entry_ad.get().strip()
    if not ad:
        messagebox.showwarning("Uyarı", "Dua adı boş olamaz!")
        return

    okunus = text_okunus.get("1.0", tk.END).strip()
    meal = text_meal.get("1.0", tk.END).strip()
    
    try:
        hedef = int(entry_hedef.get().strip() or "33")
    except ValueError:
        messagebox.showwarning("Uyarı", "Hedef sayısı rakamlardan oluşmalıdır!")
        return

    global aktif_dua_id
    is_new = False
    if not aktif_dua_id:
        aktif_dua_id = "dua_" + str(uuid.uuid4().hex[:8])
        is_new = True

    yeni_veri = {
        "id": aktif_dua_id,
        "name": ad,
        "text": okunus,
        "meaning": meal,
        "goal": hedef
    }

    if is_new:
        # Yeni dua doğrudan havuza eklenir
        app_data["items"].append(yeni_veri)
        messagebox.showinfo("Başarılı", "Yeni dua Havuza eklendi!\nİstediğiniz listeye aktarabilirsiniz.")
    else:
        # Mevcut duayı havuzda ve bulunduğu listelerde güncelle
        for i, d in enumerate(app_data["items"]):
            if d["id"] == aktif_dua_id:
                app_data["items"][i] = yeni_veri
                break
        for lst in app_data["lists"]:
            for i, d in enumerate(lst.get("items", [])):
                if d["id"] == aktif_dua_id:
                    lst["items"][i] = yeni_veri
        messagebox.showinfo("Başarılı", "Dua tüm listelerde güncellendi!")

    save_data_to_file()
    guncelle_sol_tablo()
    guncelle_sag_tablo()
    form_temizle()

def havuzdan_tamamen_sil():
    global aktif_dua_id
    if not aktif_dua_id:
        messagebox.showwarning("Uyarı", "Lütfen silinecek bir dua seçin.")
        return
        
    cevap = messagebox.askyesno("Kalıcı Silme", "Bu duayı HAVUZDAN ve EKLİ OLDUĞU TÜM LİSTELERDEN tamamen silmek istediğinize emin misiniz?")
    if cevap:
        # Havuzdan sil
        app_data["items"] = [d for d in app_data["items"] if d["id"] != aktif_dua_id]
        # Tüm listelerden sil
        for lst in app_data["lists"]:
            lst["items"] = [d for d in lst.get("items", []) if d["id"] != aktif_dua_id]
            
        save_data_to_file()
        guncelle_sol_tablo()
        guncelle_sag_tablo()
        form_temizle()
        messagebox.showinfo("Silindi", "Dua sistemden kalıcı olarak temizlendi.")

def yeni_liste_ekle():
    isim = simpledialog.askstring("Yeni Liste", "Listenin adını girin:")
    if isim and isim.strip():
        app_data["lists"].append({
            "id": "list_" + str(uuid.uuid4().hex[:8]),
            "name": isim.strip(),
            "items": []
        })
        global secili_liste_index
        secili_liste_index = len(app_data["lists"]) - 1
        save_data_to_file()
        guncelle_combo_listeler()
        guncelle_sag_tablo()

def liste_sil():
    global secili_liste_index
    if secili_liste_index < 0: return
    if len(app_data["lists"]) <= 1:
        messagebox.showwarning("Uyarı", "En az bir liste kalmalıdır!")
        return
    cevap = messagebox.askyesno("Emin misiniz?", "Bu LİSTEYİ silmek istediğinize emin misiniz?\n(İçindeki dualar Havuz'da kalmaya devam eder, sadece liste silinir.)")
    if cevap:
        app_data["lists"].pop(secili_liste_index)
        secili_liste_index = 0
        save_data_to_file()
        guncelle_combo_listeler()
        guncelle_sag_tablo()

def yedekten_ice_aktar():
    dosya_yolu = filedialog.askopenfilename(title="Yedek JSON Seçin", filetypes=(("JSON", "*.json"), ("Tüm", "*.*")))
    if not dosya_yolu: return
        
    try:
        with open(dosya_yolu, "r", encoding="utf-8") as f:
            yedek_data = json.load(f)
    except Exception as e:
        messagebox.showerror("Hata", f"Yedek okunamadı: {e}")
        return
        
    eklenecekler = []
    if isinstance(yedek_data, list): eklenecekler = yedek_data
    elif isinstance(yedek_data, dict):
        if "lists" in yedek_data and isinstance(yedek_data["lists"], list):
            for lst in yedek_data["lists"]: eklenecekler.extend(lst.get("items", []))
        elif "items" in yedek_data: eklenecekler = yedek_data["items"]
            
    if not eklenecekler: return messagebox.showinfo("Bilgi", "Dua bulunamadı.")
        
    yeni_eklenenler = []
    for dua in eklenecekler:
        yeni_eklenenler.append({
            "id": "dua_" + str(uuid.uuid4().hex[:8]),
            "name": dua.get("name", "İsimsiz"),
            "text": dua.get("text", ""),
            "meaning": dua.get("meaning", ""),
            "goal": int(dua.get("goal", 33)) if str(dua.get("goal", 33)).isdigit() else 33
        })
        
    app_data["items"].extend(yeni_eklenenler)
    save_data_to_file()
    guncelle_sol_tablo()
    messagebox.showinfo("Başarılı", f"{len(yeni_eklenenler)} dua Genel Havuz'a eklendi!")

def github_gonder():
    cevap = messagebox.askyesno("GitHub'a Yükle", "Değişiklikler canlıya (telefonlara) gönderilsin mi?")
    if not cevap: return
    btn_github.config(text="Yükleniyor...", state=tk.DISABLED)
    root.update()
    try:
        subprocess.run(["git", "add", "dualar.json"], check=True)
        subprocess.run(["git", "commit", "-m", "Arayüzden dualar ve listeler güncellendi"], capture_output=True, text=True)
        subprocess.run(["git", "push", "origin", "main"], check=True)
        messagebox.showinfo("Başarılı", "Tüm liste ve dualar başarıyla GitHub'a gönderildi!\nZikirmatik güncellendi.")
    except Exception as e:
        messagebox.showerror("Hata", f"Git hatası: {e}")
    finally:
        btn_github.config(text="☁️ BULUTA (GITHUB) YÜKLE VE YAYINLA", state=tk.NORMAL)

# --- TASARIM ---
root = tk.Tk()
root.title("Zikirmatik Dua ve Liste Aktarım Yöneticisi")
root.geometry("1100x700")
root.configure(bg="#f4f4f4")
style = ttk.Style()
style.theme_use("clam")

# Üst - Liste Kontrolleri
frame_ust = tk.Frame(root, bg="#ecf0f1", pady=10, padx=10)
frame_ust.pack(fill=tk.X)

tk.Label(frame_ust, text="Düzenlenecek Kategori (Liste): ", font=("Helvetica", 11, "bold"), bg="#ecf0f1").pack(side=tk.LEFT)
combo_listeler = ttk.Combobox(frame_ust, state="readonly", font=("Helvetica", 11), width=30)
combo_listeler.pack(side=tk.LEFT, padx=5)
combo_listeler.bind("<<ComboboxSelected>>", combo_secildi)

tk.Button(frame_ust, text="➕ Yeni Liste", command=yeni_liste_ekle, bg="#27ae60", fg="white", font=("Helvetica", 10, "bold")).pack(side=tk.LEFT, padx=5)
tk.Button(frame_ust, text="🗑️ Listeyi Sil", command=liste_sil, bg="#c0392b", fg="white", font=("Helvetica", 10, "bold")).pack(side=tk.LEFT, padx=5)
tk.Button(frame_ust, text="📥 Yedekten Havuza Ekle", command=yedekten_ice_aktar, bg="#f39c12", fg="white", font=("Helvetica", 10, "bold")).pack(side=tk.RIGHT, padx=5)

# Orta - Transfer Bölümü (Shuttle)
frame_orta = tk.Frame(root, bg="#f4f4f4", padx=10, pady=10)
frame_orta.pack(fill=tk.BOTH, expand=True)

# Sol Tablo (Havuz)
frame_sol = tk.Frame(frame_orta, bg="#f4f4f4")
frame_sol.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
tk.Label(frame_sol, text="📚 Onaylı Tüm Dualar (Havuz)", font=("Helvetica", 11, "bold"), bg="#f4f4f4").pack(anchor="w")

tree_havuz = ttk.Treeview(frame_sol, columns=("ad", "hedef", "id"), show="headings", selectmode="extended")
tree_havuz.heading("ad", text="Dua Adı")
tree_havuz.column("ad", width=200)
tree_havuz.heading("hedef", text="Hedef")
tree_havuz.column("hedef", width=50, anchor="center")
tree_havuz.heading("id", text="ID")
tree_havuz.column("id", width=80, stretch=False)
tree_havuz.pack(fill=tk.BOTH, expand=True)
tree_havuz.bind("<<TreeviewSelect>>", dua_secildi_sol)

def havuz_tumunu_sec(event=None):
    tree_havuz.selection_set(tree_havuz.get_children())
    return "break"
tree_havuz.bind("<Control-a>", havuz_tumunu_sec)
tree_havuz.bind("<Control-A>", havuz_tumunu_sec)

tk.Button(frame_sol, text="☑️ Hepsini Seç (Ctrl+A)", command=havuz_tumunu_sec, bg="#ecf0f1", font=("Helvetica", 9)).pack(anchor="w", pady=2)

# Oklar
frame_oklar = tk.Frame(frame_orta, bg="#f4f4f4", padx=10)
frame_oklar.pack(side=tk.LEFT, fill=tk.Y)
tk.Label(frame_oklar, bg="#f4f4f4").pack(expand=True) # Spacer
tk.Button(frame_oklar, text="Aşağıdaki\nListeye\nEkle 👉", command=aktar_saga, bg="#3498db", fg="white", font=("Helvetica", 11, "bold"), width=10, pady=10).pack(pady=5)
tk.Button(frame_oklar, text="👈 Listeden\nÇıkar", command=aktar_sola_cikar, bg="#e74c3c", fg="white", font=("Helvetica", 11, "bold"), width=10, pady=10).pack(pady=5)
tk.Label(frame_oklar, bg="#f4f4f4").pack(expand=True) # Spacer

# Sağ Tablo (Seçili Liste)
frame_sag = tk.Frame(frame_orta, bg="#f4f4f4")
frame_sag.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
tk.Label(frame_sag, text="📋 Seçili Listedeki Dualar (Sıralı)", font=("Helvetica", 11, "bold"), bg="#f4f4f4").pack(anchor="w")

tree_liste = ttk.Treeview(frame_sag, columns=("ad", "hedef", "id"), show="headings", selectmode="extended")
tree_liste.heading("ad", text="Dua Adı")
tree_liste.column("ad", width=200)
tree_liste.heading("hedef", text="Hedef")
tree_liste.column("hedef", width=50, anchor="center")
tree_liste.heading("id", text="ID")
tree_liste.column("id", width=80, stretch=False)
tree_liste.pack(fill=tk.BOTH, expand=True)
tree_liste.bind("<<TreeviewSelect>>", dua_secildi_sag)

def liste_tumunu_sec(event=None):
    tree_liste.selection_set(tree_liste.get_children())
    return "break"
tree_liste.bind("<Control-a>", liste_tumunu_sec)
tree_liste.bind("<Control-A>", liste_tumunu_sec)

tk.Button(frame_sag, text="☑️ Hepsini Seç (Ctrl+A)", command=liste_tumunu_sec, bg="#ecf0f1", font=("Helvetica", 9)).pack(anchor="w", pady=2)

frame_sag_alt = tk.Frame(frame_sag, bg="#f4f4f4")
frame_sag_alt.pack(fill=tk.X, pady=5)
tk.Button(frame_sag_alt, text="⬆️ Yukarı Taşı", command=liste_yukari, bg="#bdc3c7", font=("Helvetica", 10, "bold")).pack(side=tk.LEFT, expand=True, fill=tk.X, padx=2)
tk.Button(frame_sag_alt, text="⬇️ Aşağı Taşı", command=liste_asagi, bg="#bdc3c7", font=("Helvetica", 10, "bold")).pack(side=tk.LEFT, expand=True, fill=tk.X, padx=2)


# Alt - Form
frame_form = tk.LabelFrame(root, text="Dua Düzenleme / Ekleme Alanı", bg="#f4f4f4", font=("Helvetica", 10, "bold"), padx=10, pady=10)
frame_form.pack(fill=tk.X, padx=10, pady=5)

f1 = tk.Frame(frame_form, bg="#f4f4f4")
f1.pack(fill=tk.X, pady=2)
tk.Label(f1, text="Dua Adı / Başlığı:", bg="#f4f4f4", font=("Helvetica", 9, "bold"), width=18, anchor="e").pack(side=tk.LEFT)
entry_ad = tk.Entry(f1, font=("Helvetica", 10))
entry_ad.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=5)

tk.Label(f1, text="Hedef:", bg="#f4f4f4", font=("Helvetica", 9, "bold")).pack(side=tk.LEFT)
entry_hedef = tk.Entry(f1, font=("Helvetica", 10), width=10)
entry_hedef.pack(side=tk.LEFT, padx=5)

tk.Label(f1, text="ID:", bg="#f4f4f4", font=("Helvetica", 9, "bold")).pack(side=tk.LEFT)
entry_id = tk.Entry(f1, font=("Helvetica", 10), width=15, state="readonly")
entry_id.pack(side=tk.LEFT, padx=5)

f2 = tk.Frame(frame_form, bg="#f4f4f4")
f2.pack(fill=tk.X, pady=2)
tk.Label(f2, text="Okunuş / Dua Metni:", bg="#f4f4f4", font=("Helvetica", 9, "bold"), width=18, anchor="e").pack(side=tk.LEFT)
text_okunus = tk.Text(f2, font=("Helvetica", 10), height=3, wrap=tk.WORD)
text_okunus.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=5)

f3 = tk.Frame(frame_form, bg="#f4f4f4")
f3.pack(fill=tk.X, pady=2)
tk.Label(f3, text="Anlamı / Meal:", bg="#f4f4f4", font=("Helvetica", 9, "bold"), width=18, anchor="e").pack(side=tk.LEFT)
text_meal = tk.Text(f3, font=("Helvetica", 10), height=3, wrap=tk.WORD)
text_meal.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=5)

frame_butonlar = tk.Frame(frame_form, bg="#f4f4f4")
frame_butonlar.pack(fill=tk.X, pady=5)
tk.Button(frame_butonlar, text="✨ Formu Temizle (Yeni Dua)", command=form_temizle, bg="#95a5a6", fg="white", font=("Helvetica", 10, "bold")).pack(side=tk.LEFT, padx=5)
tk.Button(frame_butonlar, text="💾 Kaydet / Güncelle", command=formu_kaydet, bg="#2ecc71", fg="white", font=("Helvetica", 10, "bold")).pack(side=tk.LEFT, padx=5)
tk.Button(frame_butonlar, text="🗑️ Havuzdan Tamamen Sil", command=havuzdan_tamamen_sil, bg="#e74c3c", fg="white", font=("Helvetica", 10, "bold")).pack(side=tk.RIGHT, padx=5)

btn_github = tk.Button(root, text="☁️ BULUTA (GITHUB) YÜKLE VE YAYINLA", command=github_gonder, bg="#3498db", fg="white", font=("Helvetica", 12, "bold"), pady=10)
btn_github.pack(fill=tk.X, padx=10, pady=10)

load_data()
guncelle_combo_listeler()
guncelle_sol_tablo()
guncelle_sag_tablo()

root.mainloop()
