import tkinter as tk
from tkinter import ttk, messagebox, simpledialog, filedialog
import ttkbootstrap as tb
from ttkbootstrap.constants import *
import json
import re
import os
import firebase_admin
from firebase_admin import credentials, firestore, auth
from datetime import datetime
import subprocess
import uuid
import sys
import urllib.request
import threading

JSON_FILE = "dualar.json"

LOG_FILE = "yonetici_log.txt"
GITHUB_RAW_URL = "https://raw.githubusercontent.com/selahattin35/dualar/main/dualar.json"
# 🔒 Yönetici aracı şifresi — istediğiniz şifreyi buraya yazın
ADMIN_PASSWORD = "7412"

def log_action(mesaj):
    """Admin işlemlerini yonetici_log.txt dosyasına yazar."""
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(f"[{datetime.now():%d.%m.%Y %H:%M:%S}] {mesaj}\n")
    except Exception:
        pass

def get_firestore():
    if not firebase_admin._apps:
        cred = credentials.Certificate("serviceAccountKey.json")
        firebase_admin.initialize_app(cred)
    return firestore.client()

app_data = {
    "version": 2,
    "items": [],
    "lists": [],
    "legacyMap": {},
    "congratsText": ""
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
                    # Telefona asla gömülmeyen, GitHub'dan çekilen yardımcı veriler
                    app_data["legacyMap"] = data.get("legacyMap", {}) or {}
                    app_data["congratsText"] = data.get("congratsText", "") or ""
        except Exception as e:
            messagebox.showerror("Hata", f"Dosya okunamadı: {e}")
            
    if not app_data["lists"]:
        app_data["lists"] = [{"id": "varsayilan", "name": "Varsayılan Liste", "items": []}]
        
    # Ensure all items have grpid
    for p in app_data["items"]:
        if "grpid" not in p:
            p["grpid"] = "genel"

    update_unique_items()
    
    # Enrich list items from pool (for UI)
    havuz_map = {p["id"]: p for p in app_data.get("items", [])}
    for lst in app_data["lists"]:
        enriched_items = []
        for p in lst.get("items", []):
            if "id" in p and p["id"] in havuz_map:
                full_p = havuz_map[p["id"]].copy()
                full_p["goal"] = p.get("goal", full_p.get("goal", 33))
                enriched_items.append(full_p)
        lst["items"] = enriched_items
        
    secili_liste_index = 0

def update_unique_items():
    havuz_map = {p["id"]: p for p in app_data.get("items", [])}
    app_data["items"] = list(havuz_map.values())

def save_data_to_file():
    update_unique_items()
    data_to_save = {
        "version": 2,
        "items": app_data["items"],
        "lists": [],
        # Uygulama bu alanları GitHub'dan çeker; kaydetme sırasında korunmalı
        "legacyMap": app_data.get("legacyMap", {}) or {},
        "congratsText": app_data.get("congratsText", "") or ""
    }
    for lst in app_data["lists"]:
        new_lst = {"id": lst.get("id", "list_" + str(uuid.uuid4().hex[:8])), "name": lst["name"], "items": []}
        for p in lst.get("items", []):
            new_lst["items"].append({"id": p["id"], "goal": p.get("goal", 33)})
        data_to_save["lists"].append(new_lst)
        
    try:
        with open(JSON_FILE, "w", encoding="utf-8") as f:
            json.dump(data_to_save, f, ensure_ascii=False, indent=2)
    except Exception as e:
        messagebox.showerror("Hata", f"Dosya kaydedilemedi: {e}")

# --- GUI GÜNCELLEMELERİ ---

def guncelle_combo_tur():
    turler_counts = {}
    toplam_dua = 0
    for d in app_data["items"]:
        tur = d.get("tur", "genel") or "genel"
        turler_counts[tur] = turler_counts.get(tur, 0) + 1
        toplam_dua += 1

    turler = sorted(list(turler_counts.keys()))
    entry_tur['values'] = turler
    
    try:
        mevcut_filtre_tam = combo_filtre.get()
        mevcut_filtre = mevcut_filtre_tam.rsplit(" (", 1)[0] if " (" in mevcut_filtre_tam else mevcut_filtre_tam
        
        yeni_degerler = [f"Tümü ({toplam_dua} dua)"]
        for tur in turler:
            yeni_degerler.append(f"{tur} ({turler_counts[tur]} dua)")
            
        combo_filtre['values'] = yeni_degerler
        
        bulundu = False
        for val in yeni_degerler:
            if val.startswith(mevcut_filtre + " (") or val == mevcut_filtre:
                combo_filtre.set(val)
                bulundu = True
                break
        if not bulundu:
            combo_filtre.set(yeni_degerler[0])
    except NameError:
        pass

def tur_degisti(event=None):
    tur = entry_tur.get().strip()
    if not tur:
        tur = "genel"
        
    existing_grpid = next((d.get("grpid") for d in app_data["items"] if d.get("tur") == tur and d.get("grpid")), None)
    if existing_grpid:
        grpid_goster = existing_grpid
    else:
        max_grp = 0
        for d in app_data["items"]:
            m = re.match(r"^g(\d+)$", d.get("grpid", ""))
            if m:
                max_grp = max(max_grp, int(m.group(1)))
        grpid_goster = f"g{max_grp + 1:05d}"
        
    entry_grpid.config(state=tk.NORMAL)
    entry_grpid.delete(0, tk.END)
    entry_grpid.insert(0, grpid_goster)
    entry_grpid.config(state="readonly")


def guncelle_combo_listeler():
    liste_isimleri = [f"{lst.get('name', 'Adsız')} ({len(lst.get('items', []))} dua)" for lst in app_data["lists"]]
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

def treeview_sort_column(tv, col, reverse):
    l = [(tv.set(k, col), k) for k in tv.get_children('')]
    try:
        l.sort(key=lambda t: int(t[0]), reverse=reverse)
    except ValueError:
        l.sort(reverse=reverse)
    for index, (val, k) in enumerate(l):
        tv.move(k, '', index)
    tv.heading(col, command=lambda _col=col: treeview_sort_column(tv, _col, not reverse))

def guncelle_sol_tablo():
    try:
        secili_filtre_tam = combo_filtre.get()
        secili_filtre = secili_filtre_tam.rsplit(" (", 1)[0] if " (" in secili_filtre_tam else secili_filtre_tam
    except NameError:
        secili_filtre = "Tümü"

    try:
        arama = entry_arama.get().strip().lower()
    except NameError:
        arama = ""

    for item in tree_havuz.get_children():
        tree_havuz.delete(item)
    for dua in app_data["items"]:
        tur = dua.get("tur", "genel") or "genel"
        if secili_filtre and secili_filtre != "Tümü" and tur != secili_filtre:
            continue
        if arama:
            hay_v = ((dua.get("name", "") or "") + " " + (dua.get("text", "") or "")).lower()
            if arama not in hay_v:
                continue
        # ID, Adı, Hedef
        tree_havuz.insert("", tk.END, iid="havuz_"+dua["id"], values=(dua.get("name", "İsimsiz"), dua.get("tur", ""), dua.get("grpid", "genel"), dua.get("goal", 33), dua["id"]))

def guncelle_sag_tablo():
    for item in tree_liste.get_children():
        tree_liste.delete(item)
    if secili_liste_index < 0 or secili_liste_index >= len(app_data["lists"]):
        return
    lst = app_data["lists"][secili_liste_index]
    for index, dua in enumerate(lst.get("items", [])):
        # Benzersiz IID için index ekliyoruz, çünkü aynı dua listede birden fazla olabilir
        tree_liste.insert("", tk.END, iid=f"liste_{dua['id']}_{index}", values=(dua.get("name", "İsimsiz"), dua.get("tur", ""), dua.get("grpid", "genel"), dua.get("goal", 33), dua["id"]))

def dua_secildi_sol(event):
    selection = tree_havuz.selection()
    if selection:
        dua_id = tree_havuz.item(selection[0], "values")[4]
        formu_doldur(dua_id)

def dua_secildi_sag(event):
    selection = tree_liste.selection()
    if selection:
        dua_id = tree_liste.item(selection[0], "values")[4]
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
    
    entry_tur.set(dua.get("tur", ""))
    
    entry_grpid.config(state=tk.NORMAL)
    entry_grpid.delete(0, tk.END)
    entry_grpid.insert(0, dua.get("grpid", "g00001"))
    entry_grpid.config(state="readonly")

    text_okunus.delete("1.0", tk.END)
    text_okunus.insert("1.0", dua.get("text", ""))

    text_arapca.delete("1.0", tk.END)
    text_arapca.insert("1.0", dua.get("arabic", ""))

    text_meal.delete("1.0", tk.END)
    text_meal.insert("1.0", dua.get("meaning", ""))

    text_kaynak.delete("1.0", tk.END)
    text_kaynak.insert("1.0", dua.get("source", ""))

    entry_hedef.delete(0, tk.END)
    entry_hedef.insert(0, str(dua.get("goal", 33)))

def form_temizle():
    global aktif_dua_id
    aktif_dua_id = None
    entry_id.config(state=tk.NORMAL)
    entry_id.delete(0, tk.END)
    entry_id.config(state="readonly")
    entry_ad.delete(0, tk.END)
    entry_tur.set("genel")
    entry_grpid.config(state=tk.NORMAL)
    entry_grpid.delete(0, tk.END)
    entry_grpid.insert(0, "g00001")
    entry_grpid.config(state="readonly")
    text_okunus.delete("1.0", tk.END)
    text_arapca.delete("1.0", tk.END)
    text_meal.delete("1.0", tk.END)
    text_kaynak.delete("1.0", tk.END)
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
        dua_id = tree_havuz.item(sel, "values")[4]
        dua = next((d for d in app_data["items"] if d["id"] == dua_id), None)
        if dua:
            app_data["lists"][secili_liste_index]["items"].append(dua.copy())
            eklenen_sayisi += 1
            
    if eklenen_sayisi > 0:
        save_data_to_file()
        guncelle_combo_listeler()
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
        guncelle_combo_listeler()
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
    tur = entry_tur.get().strip()
    grpid = entry_grpid.get().strip() or "genel"
    if not ad:
        messagebox.showwarning("Uyarı", "Dua adı boş olamaz!")
        return

    okunus = text_okunus.get("1.0", tk.END).strip()
    arapca = text_arapca.get("1.0", tk.END).strip()
    meal = text_meal.get("1.0", tk.END).strip()

    if not okunus and not arapca and not meal:
        if not messagebox.askyesno("Uyarı", "Dua metni (Okunuş), Arapça ve Meal boş. Yine de kaydedilsin mi?"):
            return
    elif not okunus:
        if not messagebox.askyesno("Uyarı", "Okunuş metni boş. Yine de kaydedilsin mi?"):
            return
    
    kaynak = text_kaynak.get("1.0", tk.END).strip()
    try:
        hedef = int(entry_hedef.get().strip() or "33")
    except ValueError:
        messagebox.showwarning("Uyarı", "Hedef sayısı rakamlardan oluşmalıdır!")
        return

    global aktif_dua_id
    is_new = False
    if not aktif_dua_id:
        max_id = 0
        for d in app_data["items"]:
            m = re.match(r"^d(\d+)$", d.get("id", ""))
            if m:
                max_id = max(max_id, int(m.group(1)))
        aktif_dua_id = f"d{max_id + 1:05d}"
        is_new = True

    # Otomatik grpid belirleme (Sıralı formata göre gruplama)
    if not tur:
        tur = "genel"

    existing_grpid = next((d.get("grpid") for d in app_data["items"] if d.get("tur") == tur and d.get("grpid")), None)
    if existing_grpid:
        grpid_to_save = existing_grpid
    else:
        # Yeni bir tür ise yeni sıralı grpid üret
        max_grp = 0
        for d in app_data["items"]:
            m = re.match(r"^g(\d+)$", d.get("grpid", ""))
            if m:
                max_grp = max(max_grp, int(m.group(1)))
        grpid_to_save = f"g{max_grp + 1:05d}"


    # Formu güncelleyelim (Kullanıcı yeni ID'yi görsün)
    entry_grpid.config(state=tk.NORMAL)
    entry_grpid.delete(0, tk.END)
    entry_grpid.insert(0, grpid_to_save)
    entry_grpid.config(state="readonly")

    yeni_veri = {
        "id": aktif_dua_id,
        "grpid": grpid_to_save,
        "tur": tur,
        "name": ad,
        "text": okunus,
        "arabic": arapca,
        "meaning": meal,
        "source": kaynak,
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
    guncelle_combo_tur()
    guncelle_sol_tablo()
    guncelle_sag_tablo()
    log_action(f"Dua kaydedildi: {aktif_dua_id} - {ad}")
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
        guncelle_combo_listeler()
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

def listeyi_yeniden_adlandir():
    global secili_liste_index
    if secili_liste_index < 0 or not app_data["lists"]:
        return
        
    mevcut_isim = app_data["lists"][secili_liste_index].get("name", "")
    yeni_isim = simpledialog.askstring("Listeyi Yeniden Adlandır", "Yeni liste adını girin:", initialvalue=mevcut_isim)
    
    if yeni_isim and yeni_isim.strip():
        app_data["lists"][secili_liste_index]["name"] = yeni_isim.strip()
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
            "arabic": dua.get("arabic", ""),
            "meaning": dua.get("meaning", ""),
            "source": dua.get("source", ""),
            "tur": dua.get("tur", "genel") or "genel",
            "grpid": dua.get("grpid", "genel") or "genel",
            "goal": int(dua.get("goal", 33)) if str(dua.get("goal", 33)).isdigit() else 33
        })
        
    app_data["items"].extend(yeni_eklenenler)
    save_data_to_file()
    guncelle_sol_tablo()
    log_action(f"Yedekten içe aktarma: {len(yeni_eklenenler)} dua eklendi")
    messagebox.showinfo("Başarılı", f"{len(yeni_eklenenler)} dua Genel Havuz'a eklendi!")

def github_gonder():
    cevap = messagebox.askyesno("GitHub'a Yükle", "Değişiklikler canlıya (telefonlara) gönderilsin mi?")
    if not cevap: return
    btn_github.config(text="Yükleniyor...", state=tk.DISABLED)
    root.update()
    try:
        stamp = datetime.now().strftime("%d.%m.%Y %H:%M")
        subprocess.run(["git", "add", "dualar.json"], check=True, capture_output=True, text=True)
        commit = subprocess.run(["git", "commit", "-m", f"Arayüzden dualar ve listeler güncellendi ({stamp})"], capture_output=True, text=True)
        push = subprocess.run(["git", "push", "origin", "main"], capture_output=True, text=True)
        if push.returncode != 0:
            # Remote ileride olabilir: rebase yapıp tekrar dene
            pull = subprocess.run(["git", "pull", "--rebase", "origin", "main"], capture_output=True, text=True)
            if pull.returncode != 0:
                raise RuntimeError("Push başarısız ve rebase hatalı:\n" + (pull.stderr or "")[:600])
            push = subprocess.run(["git", "push", "origin", "main"], capture_output=True, text=True)
            if push.returncode != 0:
                raise RuntimeError("Push başarısız:\n" + (push.stderr or "")[:600])
        # Başarılı: Firebase'deki onaylanmış duaları sil (artık GitHub deposunda)
        silinen = 0
        temizlik_hatasi = False
        try:
            db = get_firestore()
            for doc in db.collection("custom_prayers").where("status", "==", "onaylandi").stream():
                doc.reference.delete()
                silinen += 1
        except Exception as e:
            print("Firebase temizliği atlandı:", e)
            temizlik_hatasi = True
            log_action(f"Firebase onaylı dua temizliği atlandı: {e}")
        commit_cikti = (commit.stdout or "").strip()
        if silinen:
            mesaj = f"Dualar başarıyla GitHub'a gönderildi!\n{silinen} onaylı dua Firebase'den silindi (GitHub'a taşındı)."
        elif temizlik_hatasi:
            mesaj = "Dualar GitHub'a gönderildi ancak Firebase'deki onaylı dualar temizlenemedi (ağ/bağlantı hatası). Dualar Firebase'de kaldı; bir sonraki gönderimde tekrar temizlenecek."
        elif "nothing to commit" in commit_cikti:
            mesaj = "Değişiklik yok — dualar zaten güncel. Firebase onaylı dualar kontrol edildi."
        else:
            mesaj = "Tüm liste ve dualar başarıyla GitHub'a gönderildi!\nZikirmatik güncellendi."
        log_action(f"GitHub push başarılı | Firebase'den silinen onaylı dua: {silinen}")
        messagebox.showinfo("Başarılı", mesaj)
    except Exception as e:
        log_action(f"GitHub push HATASI: {e}")
        messagebox.showerror("Hata", f"Git hatası: {e}")
    finally:
        btn_github.config(text="☁️ BULUTA (GITHUB) YÜKLE VE YAYINLA", state=tk.NORMAL)

def github_indir():
    cevap = messagebox.askyesno("GitHub'dan İndir", "Canlıdaki (GitHub) en güncel dualar.json dosyası indirilsin mi?\n(Mevcut kaydedilmemiş değişiklikleriniz ezilebilir!)")
    if not cevap: return
    btn_github_indir.config(text="İndiriliyor...", state=tk.DISABLED)
    root.update()
    try:
        indir = subprocess.run(["git", "pull", "origin", "main"], capture_output=True, text=True)
        if indir.returncode != 0:
            raise RuntimeError(indir.stderr or "pull başarısız")
        load_data()
        guncelle_combo_tur()
        guncelle_combo_listeler()
        guncelle_sol_tablo()
        guncelle_sag_tablo()
        log_action("GitHub'dan veri indirildi")
        messagebox.showinfo("Başarılı", "Güncel liste GitHub'dan başarıyla indirildi!")
    except Exception as e:
        log_action(f"GitHub indirme HATASI: {e}")
        messagebox.showerror("Hata", f"Git hatası (İndirme): {e}")
    finally:
        btn_github_indir.config(text="⬇️ GITHUB'DAN GÜNCEL VERİYİ İNDİR", state=tk.NORMAL)

def normalize_name(n):
    """Karşılaştırma için ismi temizle: küçük harf, tırnakları at, boşlukları tekleştir."""
    s = str(n or "").lower().strip()
    for ch in ['\u201c', '\u201d', '"', "'", '\u00ab', '\u00bb']:
        s = s.replace(ch, "")
    return " ".join(s.split())

def find_matching_item(legacy_name):
    """Eski dua adını depodaki en olası öğeyle eşleştirir (token tabanlı)."""
    target = normalize_name(legacy_name)
    tokens = [t for t in target.split() if len(t) >= 4]
    best = None
    best_score = 0
    for it in app_data.get("items", []):
        cand = normalize_name(it.get("name", ""))
        score = 0
        if cand == target:
            score += 1000
        for t in tokens:
            if t in cand or cand in t:
                score += len(t)
        if score > best_score:
            best_score = score
            best = it
    return (best, best_score) if best_score > 0 else (None, 0)

def eski_dualari_eslestir():
    """legacyMap'teki eski ID'lere depodaki gerçek ID'leri verir (dua deposuna bağlar)."""
    legacy = app_data.get("legacyMap", {}) or {}
    if not legacy:
        messagebox.showinfo("Bilgi", "legacyMap boş. dualar.json'da legacyMap alanı yok.")
        return
    matched = 0
    eslesmeyen = []
    yeni = {}
    for eski_id, ad in legacy.items():
        it, skor = find_matching_item(ad)
        if it:
            yeni[eski_id] = it["id"]
            matched += 1
        else:
            eslesmeyen.append(f"{eski_id} -> {ad}")
    app_data["legacyMap"] = yeni
    save_data_to_file()
    mesaj = f"{matched} eski dua depo ID'siyle eşleştirildi ve ID verildi."
    if eslesmeyen:
        mesaj += "\n\nEşleşmeyenler (elle eşleştirin):\n" + "\n".join(eslesmeyen[:10])
    messagebox.showinfo("Eşleştirme Tamam", mesaj)
    guncelle_sol_tablo()

def _github_karsilastir():
    """GitHub'daki dualar.json ile yerel depoyu karşılaştırır."""
    try:
        req = urllib.request.Request(GITHUB_RAW_URL, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=15) as resp:
            remote = json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        return None
    remote_items = {str(i.get("id")): i for i in remote.get("items", []) if isinstance(i, dict)}
    local_items = {str(i.get("id")): i for i in app_data.get("items", [])}
    eksik = [i for iid, i in remote_items.items() if iid not in local_items]
    fazla = [i for iid, i in local_items.items() if iid not in remote_items]
    degisen = [iid for iid in (set(local_items) & set(remote_items)) if local_items[iid] != remote_items[iid]]
    satirlar = [f"GitHub: {len(remote_items)} dua  |  Yerel depo: {len(local_items)} dua"]
    if not eksik and not fazla and not degisen:
        satirlar.append("✅ Sorun yok — yerel depo GitHub ile birebir aynı.")
    else:
        if eksik:
            isimler = ", ".join(str(i.get("name", "?"))[:28] for i in eksik[:5])
            if len(eksik) > 5: isimler += f" ...(+{len(eksik)-5})"
            satirlar.append(f"⬇️ GitHub'da var, yerelde YOK ({len(eksik)}): {isimler}")
        if fazla:
            isimler = ", ".join(str(i.get("name", "?"))[:28] for i in fazla[:5])
            if len(fazla) > 5: isimler += f" ...(+{len(fazla)-5})"
            satirlar.append(f"⬆️ Yerelde var, GitHub'da YOK ({len(fazla)}): {isimler}")
        if degisen:
            satirlar.append(f"✏️ İçeriği değişmiş ({len(degisen)}): " + ", ".join(degisen[:5]))
    return "\n".join(satirlar)

def github_ile_karsilastir(sessiz=False):
    """GitHub ile karşılaştırmayı arka planda yapar ve sonucu gösterir."""
    def islem():
        sonuc = _github_karsilastir()
        if sonuc is None:
            if not sessiz:
                root.after(0, lambda: messagebox.showerror("Karşılaştırma", "GitHub'a ulaşılamadı. İnternet bağlantınızı kontrol edin."))
            return
        log_action("GitHub karşılaştırma: " + sonuc.split("\n")[0])
        root.after(0, lambda: messagebox.showinfo("GitHub ile Karşılaştırma", sonuc))
    threading.Thread(target=islem, daemon=True).start()

def open_firebase_approvals():
    try:
        if not firebase_admin._apps:
            cred = credentials.Certificate("serviceAccountKey.json")
            firebase_admin.initialize_app(cred)
        db = firestore.client()
    except Exception as e:
        messagebox.showerror("Bağlantı Hatası", f"Firebase'e bağlanılamadı:\n{e}")
        return
        
    win = tb.Toplevel(root)
    win.title("☁️ Firebase Dua Yönetimi")
    win.geometry("1400x680")
    
    # ── Üst İstatistik Çubuğu ──
    frame_istatistik = tb.Frame(win, padding=(15, 10, 15, 4))
    frame_istatistik.pack(fill=X)
    tb.Label(frame_istatistik, text="📊 Firebase Özeti:", font=("Helvetica", 10, "bold")).pack(side=LEFT)
    lbl_istatistik = tb.Label(frame_istatistik, text="Veriler çekiliyor...", font=("Helvetica", 10))
    lbl_istatistik.pack(side=LEFT, padx=10)
    
    def fetch_istatistik():
        """custom_prayers koleksiyonundaki tüm duaları sayar; uid bazında kullanıcı ve boyut özeti çıkarır."""
        try:
            docs = list(db.collection("custom_prayers").stream())
            toplam = len(docs)
            bekleyen = onayli = reddedilen = diger = 0
            uid_set = set()
            toplam_boyut = 0
            for doc in docs:
                d = doc.to_dict()
                status = d.get("status", "")
                if status == "bekliyor" or status == "pending":
                    bekleyen += 1
                elif status == "onaylandi" or status == "onaylandı":
                    onayli += 1
                elif status == "reddedildi":
                    reddedilen += 1
                else:
                    diger += 1
                uid = d.get("uid", "")
                if uid and uid != "guest":
                    uid_set.add(uid)
                try:
                    toplam_boyut += len(json.dumps(d, ensure_ascii=False).encode("utf-8"))
                except Exception:
                    pass
            # Misafirler de birer ekleyen olarak sayılabilir; uid'si olmayan/guest olanları ayrı göster
            misafir_ekleyen = sum(1 for doc in docs if (doc.to_dict().get("uid") or "") == "guest")
            if toplam_boyut >= 1024 * 1024:
                boyut_str = f"{toplam_boyut / (1024 * 1024):.2f} MB"
            elif toplam_boyut >= 1024:
                boyut_str = f"{toplam_boyut / 1024:.1f} KB"
            else:
                boyut_str = f"{toplam_boyut} B"
            lbl_istatistik.config(text=(
                f"Toplam dua: {toplam}  |  ⏳ Bekleyen: {bekleyen}  |  ✅ Onaylı: {onayli}  |  "
                f"⛔ Reddedilen: {reddedilen}  |  👤 Dua ekleyen kullanıcı: {len(uid_set)} (+{misafir_ekleyen} misafir)  |  "
                f"💾 Tahmini veri boyutu: {boyut_str}"
            ), bootstyle=INFO)
        except Exception as e:
            lbl_istatistik.config(text=f"İstatistik alınamadı: {e}", bootstyle=DANGER)
    
    frame_list = tb.Frame(win, padding=15)
    frame_list.pack(fill=BOTH, expand=True)
    
    cols = ("id", "email", "name", "category", "text", "arabic", "source", "date")
    tree = tb.Treeview(frame_list, columns=cols, show="headings", selectmode="extended", bootstyle=INFO)
    tree.heading("id", text="Doc ID")
    tree.heading("email", text="Mail Adresi")
    tree.heading("name", text="Dua Adı")
    tree.heading("category", text="Kategori")
    tree.heading("text", text="Okunuş")
    tree.heading("arabic", text="Arapça")
    tree.heading("source", text="Kaynak")
    tree.heading("date", text="Tarih")
    
    tree.column("id", width=120)
    tree.column("email", width=180)
    tree.column("name", width=150)
    tree.column("category", width=80)
    tree.column("text", width=250)
    tree.column("arabic", width=200)
    tree.column("source", width=120)
    tree.column("date", width=130)
    tree.pack(fill=tk.BOTH, expand=True)
    
    prayers = []
    
    def show_full_text(event=None):
        """Çift tıklayınca duanın tam metnini göster."""
        sel = tree.selection()
        if not sel:
            return
        doc_id = tree.item(sel[0], "values")[0]
        p = next((x for x in prayers if x.get("doc_id") == doc_id), None)
        if not p:
            return
        detay = tb.Toplevel(win)
        detay.title(p.get("name", "Dua Detayı"))
        detay.geometry("640x520")
        txt = tb.Text(detay, wrap=WORD, font=("Helvetica", 11))
        txt.pack(fill=BOTH, expand=True, padx=10, pady=10)
        icerik = (
            f"ADI: {p.get('name', '')}\n\n"
            f"KATEGORİ: {p.get('category', 'genel')}\n\n"
            f"OKUNUŞ:\n{p.get('text', '')}\n\n"
            f"ARAPÇA:\n{p.get('arabic', '')}\n\n"
            f"MEAL:\n{p.get('meaning', '')}\n\n"
            f"KAYNAK:\n{p.get('source', '')}\n\n"
            f"GÖNDEREN UID: {p.get('uid', '')}\n"
        )
        txt.insert("1.0", icerik)
        txt.config(state="disabled")
    tree.bind("<Double-1>", show_full_text)
    
    frame_filtre = tb.Frame(win, padding=10)
    frame_filtre.pack(fill=X)
    
    tb.Label(frame_filtre, text="Durum Filtresi:", font=("Helvetica", 10, "bold")).pack(side=LEFT)
    combo_status = tb.Combobox(frame_filtre, state="readonly", values=["bekliyor", "onaylandi", "reddedildi"], width=15)
    combo_status.current(0)
    combo_status.pack(side=LEFT, padx=10)
    def fetch_prayers(*args):
        fetch_istatistik()
        status = combo_status.get()
        for i in tree.get_children():
            tree.delete(i)
        prayers.clear()
        try:
            docs = db.collection("custom_prayers").where("status", "==", status).stream()
            for doc in docs:
                d = doc.to_dict()
                d["doc_id"] = doc.id
                # Mail adresini bul
                uid = d.get("uid", "")
                email = uid
                if uid and uid != "guest":
                    try:
                        user_record = auth.get_user(uid)
                        email = user_record.email
                    except Exception:
                        pass
                
                # Tarih formatı
                date_str = ""
                created_at = d.get("createdAt")
                if created_at:
                    try:
                        if isinstance(created_at, str):
                            # ISO string (örn: 2026-08-13T12:23:48.574Z)
                            dt = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
                            date_str = dt.strftime("%d.%m.%Y %H:%M")
                        else:
                            # Datetime objesi
                            date_str = created_at.strftime("%d.%m.%Y %H:%M")
                    except:
                        date_str = str(created_at)[:16].replace('T', ' ')
                prayers.append(d)
                tree.insert("", tk.END, values=(
                    doc.id, 
                    email, 
                    d.get("name", ""), 
                    d.get("category", ""), 
                    d.get("text", ""),
                    d.get("arabic", ""),
                    d.get("source", ""),
                    date_str
                ))
        except Exception as e:
            messagebox.showerror("Hata", f"Veri çekilemedi:\n{e}")

    combo_status.bind("<<ComboboxSelected>>", fetch_prayers)
    btn_refresh = tb.Button(frame_filtre, text="🔄 Yenile", command=fetch_prayers, bootstyle=INFO)
    btn_refresh.pack(side=LEFT, padx=5)
            
    def benzer_dua_var(ad):
        """Depoda aynı/benzer isimli dua var mı? (mükerrer kontrolü)"""
        hedef = normalize_name(ad)
        if not hedef:
            return None
        for it in app_data.get("items", []):
            cand = normalize_name(it.get("name", ""))
            if cand == hedef:
                return it
            if len(hedef) >= 5 and (hedef in cand or cand in hedef):
                return it
        return None

    def approve_selected():
        selected = tree.selection()
        if not selected:
            return
        if not messagebox.askyesno("Onay", f"Seçili {len(selected)} dua onaylansın ve havuza eklensin mi?"):
            return

        # Mükerrer kontrolü: depoda aynı/benzer isimli dua var mı?
        onaylanacak = []
        mukerrer = []
        for item in selected:
            doc_id = tree.item(item, "values")[0]
            prayer_data = next((p for p in prayers if p["doc_id"] == doc_id), None)
            if not prayer_data:
                continue
            mevcut = benzer_dua_var(prayer_data.get("name", ""))
            if mevcut:
                mukerrer.append((prayer_data, mevcut))
            else:
                onaylanacak.append(prayer_data)

        if mukerrer:
            isimler = ", ".join(f"'{p.get('name', '')}' ≈ '{m.get('name', '')}'" for p, m in mukerrer[:5])
            if len(mukerrer) > 5:
                isimler += f" ...(+{len(mukerrer)-5})"
            if messagebox.askyesno("Mükerrer Uyarı", f"{len(mukerrer)} dua depodaki dualarla benzer:\n{isimler}\n\nYine de eklensin mi?"):
                onaylanacak.extend(p for p, _ in mukerrer)

        if not onaylanacak:
            messagebox.showinfo("Bilgi", "Onaylanacak yeni dua yok (hepsi mükerrer ve atlandı).")
            return

        added_count = 0
        for prayer_data in onaylanacak:
            doc_id = prayer_data["doc_id"]
            try:
                goal_val = int(prayer_data.get("goal", 33))
            except:
                goal_val = 33
            new_item = {
                "id": doc_id,
                "name": prayer_data.get("name", ""),
                "text": prayer_data.get("text", ""),
                "arabic": prayer_data.get("arabic", ""),
                "meaning": prayer_data.get("meaning", ""),
                "source": prayer_data.get("source", ""),
                "goal": goal_val,
                "category": prayer_data.get("category", "genel"),
                "grpid": "genel"
            }
            app_data["items"].append(new_item)
            added_count += 1
            try:
                db.collection("custom_prayers").document(doc_id).update({"status": "onaylandi"})
            except Exception as e:
                print(f"Hata {doc_id}: {e}")

        if added_count > 0:
            save_data_to_file()
            guncelle_sol_tablo()
        log_action(f"{added_count} dua onaylandı ve depoya eklendi")
        messagebox.showinfo("Başarılı", f"Seçili {added_count} dua onaylandı ve depoya eklendi!")
        fetch_prayers()
        
    def reject_selected():
        selected = tree.selection()
        if not selected:
            return
        dialog = tb.Toplevel(win)
        dialog.title("Reddetme Sebebi")
        dialog.geometry("400x320")
        dialog.grab_set() # Make it modal
        
        tb.Label(dialog, text="Lütfen bir reddetme sebebi seçin:", font=("Helvetica", 10, "bold")).pack(pady=10)
        
        reasons = [
            "Dua metninde harf/kelime hataları mevcut, lütfen düzeltin.",
            "Arapça metin veya meal kısmı hatalı/eksik.",
            "Bu dua zaten sistemde (dua deposunda) kayıtlıdır.",
            "İçerik zikirmatik kurallarına uygun değil.",
            "Diğer (Aşağıya yazınız)"
        ]
        
        combo_reason = tb.Combobox(dialog, values=reasons, state="readonly", width=45)
        combo_reason.current(0)
        combo_reason.pack(pady=5)
        
        tb.Label(dialog, text="Ek Açıklama veya Diğer Sebep (İsteğe bağlı):").pack(pady=5)
        txt_custom = tb.Text(dialog, height=4, width=45)
        txt_custom.pack(pady=5)
        
        result_reason = []
        
        def on_submit():
            sel = combo_reason.get()
            custom = txt_custom.get("1.0", tk.END).strip()
            
            if sel == "Diğer (Aşağıya yazınız)":
                if not custom:
                    messagebox.showwarning("Uyarı", "Lütfen diğer sebebini aşağıdaki alana yazın.")
                    return
                final_reason = custom
            else:
                final_reason = sel
                if custom:
                    final_reason += f" (Not: {custom})"
                    
            result_reason.append(final_reason)
            dialog.destroy()
            
        def on_cancel():
            dialog.destroy()
            
        btn_frame = tb.Frame(dialog)
        btn_frame.pack(pady=15)
        tb.Button(btn_frame, text="✅ Gönder", command=on_submit, bootstyle=DANGER).pack(side=LEFT, padx=10)
        tb.Button(btn_frame, text="İptal", command=on_cancel, bootstyle=SECONDARY).pack(side=LEFT, padx=10)
        
        win.wait_window(dialog)
        
        if not result_reason:
            return # Canceled
            
        reason = result_reason[0]
            
        for item in selected:
            doc_id = tree.item(item, "values")[0]
            try:
                db.collection("custom_prayers").document(doc_id).update({
                    "status": "reddedildi",
                    "rejectReason": reason
                })
            except Exception as e:
                print(f"Hata {doc_id}: {e}")
        log_action(f"{len(selected)} dua reddedildi: {reason[:60]}")
        messagebox.showinfo("Başarılı", "Seçili dualar reddedildi ve sebep kullanıcıya iletildi!")
        fetch_prayers()
    def delete_selected():
        selected = tree.selection()
        if not selected:
            return
        if not messagebox.askyesno("Sil", f"Seçili {len(selected)} dua silinsin mi?"):
            return
            
        for item in selected:
            doc_id = tree.item(item, "values")[0]
            try:
                db.collection("custom_prayers").document(doc_id).delete()
            except Exception as e:
                print(f"Hata {doc_id}: {e}")
        log_action(f"{len(selected)} dua kalıcı olarak silindi")
        messagebox.showinfo("Başarılı", "Seçili dualar silindi!")
        fetch_prayers()

    def set_pending_selected():
        selected = tree.selection()
        if not selected:
            return
        if not messagebox.askyesno("Beklemeye Al", f"Seçili {len(selected)} dua tekrar 'bekliyor' durumuna alınsın mı?"):
            return
            
        for item in selected:
            doc_id = tree.item(item, "values")[0]
            try:
                db.collection("custom_prayers").document(doc_id).update({"status": "bekliyor"})
            except Exception as e:
                print(f"Hata {doc_id}: {e}")
        log_action(f"{len(selected)} dua bekleme listesine alındı")
        messagebox.showinfo("Başarılı", "Seçili dualar bekleme listesine alındı!")
        fetch_prayers()

    frame_btn = tb.Frame(win, padding=10)
    frame_btn.pack()
    tb.Button(frame_btn, text="🔄 Yenile", command=fetch_prayers, bootstyle=INFO).pack(side=LEFT, padx=5)
    tb.Button(frame_btn, text="✅ Seçileni Onayla", command=approve_selected, bootstyle=SUCCESS).pack(side=LEFT, padx=5)
    tb.Button(frame_btn, text="⛔ Seçileni Reddet", command=reject_selected, bootstyle=WARNING).pack(side=LEFT, padx=5)
    tb.Button(frame_btn, text="⏳ Beklemeye Al", command=set_pending_selected, bootstyle=SECONDARY).pack(side=LEFT, padx=5)
    tb.Button(frame_btn, text="❌ Seçileni Sil", command=delete_selected, bootstyle=DANGER).pack(side=LEFT, padx=5)
    
    fetch_istatistik()
    fetch_prayers()

def open_firebase_stats():
    """Kapsamlı Firebase istatistik ekranı: kullanıcı sayıları, dua deposu, veri boyutu."""
    try:
        if not firebase_admin._apps:
            cred = credentials.Certificate("serviceAccountKey.json")
            firebase_admin.initialize_app(cred)
        db = firestore.client()
    except Exception as e:
        messagebox.showerror("Bağlantı Hatası", f"Firebase'e bağlanılamadı:\n{e}")
        return
    
    win = tb.Toplevel(root)
    win.title("📊 Firebase İstatistikleri")
    win.geometry("680x560")
    win.resizable(True, True)
    
    frame_ust = tb.Frame(win, padding=15)
    frame_ust.pack(fill=X)
    tb.Label(frame_ust, text="📊 Firebase Genel Görünümü", font=("Helvetica", 13, "bold")).pack(anchor="w")
    lbl_durum = tb.Label(frame_ust, text="Veriler çekiliyor, lütfen bekleyin...", font=("Helvetica", 10))
    lbl_durum.pack(anchor="w", pady=(5, 0))
    
    txt = tb.Text(win, font=("Helvetica", 10), wrap=WORD, state="disabled")
    txt.pack(fill=BOTH, expand=True, padx=15, pady=(0, 10))
    
    def boyut_formatla(b):
        if b >= 1024 * 1024:
            return f"{b / (1024 * 1024):.2f} MB"
        if b >= 1024:
            return f"{b / 1024:.1f} KB"
        return f"{b} B"
    
    def say_dualar():
        try:
            docs = list(db.collection("custom_prayers").stream())
            toplam = len(docs)
            bekleyen = onayli = reddedilen = diger = 0
            uid_set = set()
            boyut = 0
            for doc in docs:
                d = doc.to_dict()
                status = d.get("status", "")
                if status == "bekliyor" or status == "pending":
                    bekleyen += 1
                elif status == "onaylandi" or status == "onaylandı":
                    onayli += 1
                elif status == "reddedildi":
                    reddedilen += 1
                else:
                    diger += 1
                uid = d.get("uid", "")
                if uid and uid != "guest":
                    uid_set.add(uid)
                try:
                    boyut += len(json.dumps(d, ensure_ascii=False).encode("utf-8"))
                except Exception:
                    pass
            return toplam, bekleyen, onayli, reddedilen, diger, uid_set, boyut, None
        except Exception as e:
            return None, None, None, None, None, set(), 0, str(e)
    
    def calistir():
        try:
            lbl_durum.config(text="Veriler çekiliyor, lütfen bekleyin...", bootstyle=INFO)
            win.update_idletasks()
            
            satirlar = []
            
            # 1) Firebase Auth kullanıcı sayısı
            try:
                auth_toplam = 0
                page = auth.list_users()
                while page is not None:
                    auth_toplam += len(page.users)
                    if page.next_page_token:
                        page = auth.list_users(page_token=page.next_page_token)
                    else:
                        break
                satirlar.append(f"👥 Firebase Auth kayıtlı kullanıcı: {auth_toplam}")
            except Exception as e:
                satirlar.append(f"👥 Firebase Auth kullanıcı sayısı alınamadı: {e}")
            
            # 2) users koleksiyonu (uygulamada state kaydeden kullanıcılar)
            try:
                users_docs = list(db.collection("users").stream())
                users_uid = set()
                users_boyut = 0
                # Aktif kullanıcı tespiti: dokümanın son güncellenme zamanı (Firestore update_time)
                aktif_24s = aktif_7g = aktif_30g = 0
                from datetime import timedelta
                simdi = datetime.now()
                for doc in users_docs:
                    users_uid.add(doc.id)
                    try:
                        users_boyut += len(json.dumps(doc.to_dict(), ensure_ascii=False).encode("utf-8"))
                    except Exception:
                        pass
                    # update_time UTC datetime objesi olarak gelir
                    ut = getattr(doc, "update_time", None)
                    if ut is not None:
                        try:
                            if hasattr(ut, "replace"):
                                ut_naif = ut.replace(tzinfo=None)
                            else:
                                ut_naif = ut
                            if simdi - ut_naif <= timedelta(hours=24):
                                aktif_24s += 1
                            if simdi - ut_naif <= timedelta(days=7):
                                aktif_7g += 1
                            if simdi - ut_naif <= timedelta(days=30):
                                aktif_30g += 1
                        except Exception:
                            pass
                satirlar.append(f"📱 Uygulamada kayıtlı kullanıcı (users koleksiyonu): {len(users_docs)}")
                satirlar.append(f"🟢 Aktif kullanıcı — son 24 saat: {aktif_24s}  |  son 7 gün: {aktif_7g}  |  son 30 gün: {aktif_30g}")
                satirlar.append(f"💾 Kullanıcı durum verileri boyutu: {boyut_formatla(users_boyut)}")
            except Exception as e:
                satirlar.append(f"📱 users koleksiyonu okunamadı: {e}")
            
            # 2b) Şu an çevrimiçi kullanıcılar (presence heartbeat)
            try:
                presence_docs = list(db.collection("presence").stream())
                from datetime import timedelta
                kesim = datetime.utcnow() - timedelta(minutes=5)
                online = 0
                online_uidler = []
                for doc in presence_docs:
                    d = doc.to_dict()
                    ls = d.get("lastSeen")
                    t = None
                    if isinstance(ls, str):
                        try:
                            t = datetime.fromisoformat(ls.replace("Z", "+00:00")).replace(tzinfo=None)
                        except Exception:
                            t = None
                    elif isinstance(ls, datetime):
                        t = ls.replace(tzinfo=None)
                    if t is not None and t >= kesim:
                        online += 1
                        online_uidler.append(doc.id)
                satirlar.append(f"🟢 ŞU AN ÇEVRİMİÇİ: {online} kullanıcı (son 5 dk)")
                if online_uidler:
                    gosterilecek = online_uidler[:10]
                    kullanici_listesi = ", ".join(gosterilecek)
                    ek_bilgi = f" (+{online - len(gosterilecek)})" if online > len(gosterilecek) else ""
                    satirlar.append(f"   Kullanıcılar: {kullanici_listesi}{ek_bilgi}")
            except Exception as e:
                satirlar.append(f"🟢 presence okunamadı: {e}")
            
            # 3) Kişisel dualar
            toplam, bekleyen, onayli, reddedilen, diger, uid_set, boyut, hata_msg = say_dualar()
            if toplam is None:
                satirlar.append(f"📚 custom_prayers okunamadı: {hata_msg}")
            else:
                satirlar.append(f"")
                satirlar.append(f"📚 Toplam kişisel dua: {toplam}")
                satirlar.append(f"   ⏳ Onay bekleyen: {bekleyen}")
                satirlar.append(f"   ✅ Onaylanmış: {onayli}")
                satirlar.append(f"   ⛔ Reddedilmiş: {reddedilen}")
                if diger:
                    satirlar.append(f"   📄 Diğer durum: {diger}")
                satirlar.append(f"👤 Dua ekleyen kullanıcı sayısı: {len(uid_set)}")
                satirlar.append(f"💾 Kişisel dua verileri boyutu: {boyut_formatla(boyut)}")
                satirlar.append(f"📝 Kişi başı ortalama dua: {toplam / max(len(uid_set), 1):.1f}")
            
            # 4) Toplam Firebase kapasite kullanımı (Firestore ücretsiz kota: 1 GiB depolama)
            try:
                toplam_boyut = 0
                koleksiyonlar = ["users", "custom_prayers"]
                for koleksiyon in koleksiyonlar:
                    try:
                        for doc in db.collection(koleksiyon).stream():
                            try:
                                toplam_boyut += len(json.dumps(doc.to_dict(), ensure_ascii=False).encode("utf-8"))
                            except Exception:
                                pass
                    except Exception:
                        pass
                # Firestore ücretsiz katman depolama kotası: 1 GiB
                kota = 1 * 1024 * 1024 * 1024  # 1 GiB bayt
                yuzde = (toplam_boyut / kota) * 100 if kota > 0 else 0
                satirlar.append(f"")
                satirlar.append(f"🗄️ TOPLAM FIRESTORE KULLANIMI")
                satirlar.append(f"   Veri boyutu: {boyut_formatla(toplam_boyut)}")
                satirlar.append(f"   Ücretsiz kota: {boyut_formatla(kota)} (1 GiB)")
                satirlar.append(f"   Kullanım oranı: %{yuzde:.4f}")
                satirlar.append(f"   Kalan kapasite: {boyut_formatla(max(0, kota - toplam_boyut))}")
            except Exception as e:
                satirlar.append(f"🗄️ Kapasite hesabı başarısız: {e}")
            
            txt.config(state="normal")
            txt.delete("1.0", tk.END)
            txt.insert("1.0", "\n".join(satirlar))
            txt.config(state="disabled")
            lbl_durum.config(text="Güncellendi ✓", bootstyle=SUCCESS)
        except Exception as e:
            lbl_durum.config(text=f"Hata: {e}", bootstyle=DANGER)
    
    frame_btn = tb.Frame(win, padding=(15, 0, 15, 15))
    frame_btn.pack(fill=X)
    tb.Button(frame_btn, text="🔄 Yenile", command=calistir, bootstyle=INFO).pack(side=LEFT, padx=5)
    tb.Button(frame_btn, text="❌ Kapat", command=win.destroy, bootstyle=SECONDARY).pack(side=LEFT, padx=5)
    
    calistir()

root = tb.Window(themename="litera")
root.title("Zikirmatik Dua ve Liste Aktarım Yöneticisi")
root.geometry("1200x800")

def gate_password():
    """Basit yönetici şifresi koruması (3 deneme, iptal/yanlış = çıkış)."""
    deneme = 0
    while deneme < 3:
        p = simpledialog.askstring("🔒 Yönetici Girişi", "Yönetici şifresini girin:", show="*", parent=root)
        if p is None:
            return False
        if p == ADMIN_PASSWORD:
            log_action("Yönetici girişi başarılı")
            return True
        deneme += 1
        messagebox.showerror("Hata", f"Yanlış şifre! ({deneme}/3)")
        log_action(f"HATALI şifre denemesi ({deneme}/3)")
    return False

if not gate_password():
    root.destroy()
    sys.exit(0)

# Orta - Transfer Bölümü (Shuttle)
frame_orta = tb.Frame(root, padding=10)
frame_orta.pack(fill=BOTH, expand=True)

# Sol Tablo (Havuz)
frame_sol = tb.Frame(frame_orta)
frame_sol.pack(side=LEFT, fill=BOTH, expand=True)

frame_havuz_ust = tb.Frame(frame_sol)
frame_havuz_ust.pack(fill=X, pady=5)

tb.Label(frame_havuz_ust, text="📚 Tüm Dualar (Havuz)", font=("Helvetica", 12, "bold")).pack(side=LEFT)

tb.Label(frame_havuz_ust, text="🔍 Ara:", font=("Helvetica", 10)).pack(side=LEFT, padx=(10, 2))
entry_arama = tb.Entry(frame_havuz_ust, font=("Helvetica", 10), width=18)
entry_arama.pack(side=LEFT)
entry_arama.bind("<KeyRelease>", lambda e: guncelle_sol_tablo())

tb.Label(frame_havuz_ust, text=" | Tür Filtresi:", font=("Helvetica", 10)).pack(side=LEFT)
combo_filtre = tb.Combobox(frame_havuz_ust, state="readonly", font=("Helvetica", 10), width=22)
combo_filtre.pack(side=LEFT, padx=5)
combo_filtre.bind("<<ComboboxSelected>>", lambda e: guncelle_sol_tablo())

tb.Button(frame_havuz_ust, text="📊 Firebase İstatistikleri", command=open_firebase_stats, bootstyle=WARNING).pack(side=RIGHT, padx=5)
tb.Button(frame_havuz_ust, text="☁️ Firebase Yönetimi", command=open_firebase_approvals, bootstyle=INFO).pack(side=RIGHT, padx=5)

tree_havuz = tb.Treeview(frame_sol, columns=("ad", "tur", "grpid", "hedef", "id"), show="headings", selectmode="extended", bootstyle=PRIMARY)
tree_havuz.heading("ad", text="Dua Adı", command=lambda: treeview_sort_column(tree_havuz, "ad", False))
tree_havuz.column("ad", width=140)
tree_havuz.heading("tur", text="Tür", command=lambda: treeview_sort_column(tree_havuz, "tur", False))
tree_havuz.column("tur", width=80)
tree_havuz.heading("grpid", text="Grup ID", command=lambda: treeview_sort_column(tree_havuz, "grpid", False))
tree_havuz.column("grpid", width=80)
tree_havuz.heading("hedef", text="Hedef", command=lambda: treeview_sort_column(tree_havuz, "hedef", False))
tree_havuz.column("hedef", width=50, anchor="center")
tree_havuz.heading("id", text="ID", command=lambda: treeview_sort_column(tree_havuz, "id", False))
tree_havuz.column("id", width=80, stretch=False)
tree_havuz.pack(fill=BOTH, expand=True)
tree_havuz.bind("<<TreeviewSelect>>", dua_secildi_sol)

def havuz_tumunu_sec(event=None):
    tree_havuz.selection_set(tree_havuz.get_children())
    return "break"
tree_havuz.bind("<Control-a>", havuz_tumunu_sec)
tree_havuz.bind("<Control-A>", havuz_tumunu_sec)

tb.Button(frame_sol, text="☑️ Hepsini Seç (Ctrl+A)", command=havuz_tumunu_sec, bootstyle=(SECONDARY, OUTLINE)).pack(anchor="w", pady=5)

# Oklar
frame_oklar = tb.Frame(frame_orta, padding=10)
frame_oklar.pack(side=LEFT, fill=Y)
tb.Label(frame_oklar).pack(expand=True) # Spacer
tb.Button(frame_oklar, text="Sağa Aktar 👉", command=aktar_saga, bootstyle=PRIMARY, width=15).pack(pady=10)
tb.Button(frame_oklar, text="👈 Sola Çıkar", command=aktar_sola_cikar, bootstyle=DANGER, width=15).pack(pady=10)
tb.Label(frame_oklar).pack(expand=True) # Spacer

# Sağ Tablo (Seçili Liste)
frame_sag = tb.Frame(frame_orta)
frame_sag.pack(side=LEFT, fill=BOTH, expand=True)

frame_sag_secim = tb.Frame(frame_sag)
frame_sag_secim.pack(fill=X, pady=(0, 5))

tb.Label(frame_sag_secim, text="Düzenlenecek Liste:", font=("Helvetica", 10, "bold")).pack(side=LEFT)
combo_listeler = tb.Combobox(frame_sag_secim, state="readonly", font=("Helvetica", 10), width=18)
combo_listeler.pack(side=LEFT, padx=5)
combo_listeler.bind("<<ComboboxSelected>>", combo_secildi)

tb.Button(frame_sag_secim, text="➕ Yeni", command=yeni_liste_ekle, bootstyle=SUCCESS).pack(side=LEFT, padx=2)
tb.Button(frame_sag_secim, text="✏️ Düzenle", command=listeyi_yeniden_adlandir, bootstyle=WARNING).pack(side=LEFT, padx=2)
tb.Button(frame_sag_secim, text="🗑️ Sil", command=liste_sil, bootstyle=DANGER).pack(side=LEFT, padx=2)

frame_sag_ust = tb.Frame(frame_sag)
frame_sag_ust.pack(fill=X, pady=5)
tb.Label(frame_sag_ust, text="📋 Seçili Listedeki Dualar", font=("Helvetica", 12, "bold")).pack(side=LEFT)

tree_liste = tb.Treeview(frame_sag, columns=("ad", "tur", "grpid", "hedef", "id"), show="headings", selectmode="extended", bootstyle=INFO)
tree_liste.heading("ad", text="Dua Adı", command=lambda: treeview_sort_column(tree_liste, "ad", False))
tree_liste.column("ad", width=140)
tree_liste.heading("tur", text="Tür", command=lambda: treeview_sort_column(tree_liste, "tur", False))
tree_liste.column("tur", width=80)
tree_liste.heading("grpid", text="Grup ID", command=lambda: treeview_sort_column(tree_liste, "grpid", False))
tree_liste.column("grpid", width=80)
tree_liste.heading("hedef", text="Hedef", command=lambda: treeview_sort_column(tree_liste, "hedef", False))
tree_liste.column("hedef", width=50, anchor="center")
tree_liste.heading("id", text="ID", command=lambda: treeview_sort_column(tree_liste, "id", False))
tree_liste.column("id", width=80, stretch=False)
tree_liste.pack(fill=BOTH, expand=True)
tree_liste.bind("<<TreeviewSelect>>", dua_secildi_sag)

def liste_tumunu_sec(event=None):
    tree_liste.selection_set(tree_liste.get_children())
    return "break"
tree_liste.bind("<Control-a>", liste_tumunu_sec)
tree_liste.bind("<Control-A>", liste_tumunu_sec)

frame_sag_alt_kontroller = tb.Frame(frame_sag)
frame_sag_alt_kontroller.pack(fill=X, pady=5)
tb.Button(frame_sag_alt_kontroller, text="☑️ Hepsini Seç (Ctrl+A)", command=liste_tumunu_sec, bootstyle=(SECONDARY, OUTLINE)).pack(side=LEFT)

frame_sag_alt = tb.Frame(frame_sag)
frame_sag_alt.pack(fill=X, pady=5)
tb.Button(frame_sag_alt, text="⬆️ Yukarı Taşı", command=liste_yukari, bootstyle=SECONDARY).pack(side=LEFT, expand=True, fill=X, padx=2)
tb.Button(frame_sag_alt, text="⬇️ Aşağı Taşı", command=liste_asagi, bootstyle=SECONDARY).pack(side=LEFT, expand=True, fill=X, padx=2)

# Alt - Form
frame_form = tb.LabelFrame(root, text="Dua Düzenleme / Ekleme Alanı", padding=15, bootstyle=PRIMARY)
frame_form.pack(fill=X, padx=10, pady=10)

f1 = tb.Frame(frame_form)
f1.pack(fill=X, pady=5)
tb.Label(f1, text="Dua Adı / Başlığı:", font=("Helvetica", 10, "bold"), width=18, anchor="e").pack(side=LEFT, padx=5)
entry_ad = tb.Entry(f1, font=("Helvetica", 10))
entry_ad.pack(side=LEFT, fill=X, expand=True, padx=5)

tb.Label(f1, text="Tür:", font=("Helvetica", 10, "bold")).pack(side=LEFT, padx=(15,5))
entry_tur = tb.Combobox(f1, font=("Helvetica", 10), width=15)
entry_tur.pack(side=LEFT, padx=5)
entry_tur.bind("<<ComboboxSelected>>", tur_degisti)
entry_tur.bind("<KeyRelease>", tur_degisti)

tb.Label(f1, text="Grup ID:", font=("Helvetica", 10, "bold")).pack(side=LEFT, padx=(15,5))
entry_grpid = tb.Entry(f1, font=("Helvetica", 10), width=10, state="readonly")
entry_grpid.pack(side=LEFT, padx=5)

tb.Label(f1, text="Hedef:", font=("Helvetica", 10, "bold")).pack(side=LEFT, padx=(15,5))
entry_hedef = tb.Entry(f1, font=("Helvetica", 10), width=10)
entry_hedef.pack(side=LEFT, padx=5)

tb.Label(f1, text="ID:", font=("Helvetica", 10, "bold")).pack(side=LEFT, padx=(15,5))
entry_id = tb.Entry(f1, font=("Helvetica", 10), width=15, state="readonly")
entry_id.pack(side=LEFT, padx=5)

f2 = tb.Frame(frame_form)
f2.pack(fill=X, pady=5)
tb.Label(f2, text="Okunuş / Dua Metni:", font=("Helvetica", 10, "bold"), width=18, anchor="e").pack(side=LEFT, padx=5)
text_okunus = tb.Text(f2, font=("Helvetica", 10), height=3, wrap=WORD)
text_okunus.pack(side=LEFT, fill=X, expand=True, padx=5)

f2_arapca = tb.Frame(frame_form)
f2_arapca.pack(fill=X, pady=5)
tb.Label(f2_arapca, text="Arapça:", font=("Helvetica", 10, "bold"), width=18, anchor="e").pack(side=LEFT, padx=5)
text_arapca = tb.Text(f2_arapca, font=("Helvetica", 11), height=3, wrap=WORD) # Arapça için font biraz büyük
text_arapca.pack(side=LEFT, fill=X, expand=True, padx=5)

f3 = tb.Frame(frame_form)
f3.pack(fill=X, pady=5)
tb.Label(f3, text="Anlamı / Meal:", font=("Helvetica", 10, "bold"), width=18, anchor="e").pack(side=LEFT, padx=5)
text_meal = tb.Text(f3, font=("Helvetica", 10), height=3, wrap=WORD)
text_meal.pack(side=LEFT, fill=X, expand=True, padx=5)

f4 = tb.Frame(frame_form)
f4.pack(fill=X, pady=5)
tb.Label(f4, text="Kaynak:", font=("Helvetica", 10, "bold"), width=18, anchor="e").pack(side=LEFT, padx=5)
text_kaynak = tb.Text(f4, font=("Helvetica", 10), height=2, wrap=WORD)
text_kaynak.pack(side=LEFT, fill=X, expand=True, padx=5)

frame_butonlar = tb.Frame(frame_form)
frame_butonlar.pack(fill=X, pady=10)
tb.Button(frame_butonlar, text="✨ Formu Temizle (Yeni Dua)", command=form_temizle, bootstyle=SECONDARY).pack(side=LEFT, padx=5)
tb.Button(frame_butonlar, text="✅ Kaydet / Güncelle", command=formu_kaydet, bootstyle=SUCCESS).pack(side=LEFT, padx=5)
tb.Button(frame_butonlar, text="🗑️ Havuzdan Tamamen Sil", command=havuzdan_tamamen_sil, bootstyle=DANGER).pack(side=RIGHT, padx=5)

frame_github = tb.Frame(root)
frame_github.pack(fill=X, padx=10, pady=(0, 15))

btn_github_indir = tb.Button(frame_github, text="⬇️ GITHUB'DAN GÜNCEL VERİYİ İNDİR", command=github_indir, bootstyle=(WARNING, OUTLINE))
btn_github_indir.pack(side=LEFT, fill=X, expand=True, padx=(0, 5))

btn_github = tb.Button(frame_github, text="☁️ BULUTA (GITHUB) YÜKLE VE YAYINLA", command=github_gonder, bootstyle=PRIMARY)
btn_github.pack(side=LEFT, fill=X, expand=True, padx=(5, 0))

frame_esle = tb.Frame(root)
frame_esle.pack(fill=X, padx=10, pady=(0, 15))
btn_karsilastir = tb.Button(frame_esle, text="🌐 GITHUB İLE KARŞILAŞTIR (fark / eksik / fazla)", command=lambda: github_ile_karsilastir(False), bootstyle=(INFO, OUTLINE))
btn_karsilastir.pack(fill=X, pady=(0, 6))
btn_esle = tb.Button(frame_esle, text="🔄 ESKİ DUALARA DEPO ID'Sİ VER (legacyMap'i depoyla eşleştir)", command=eski_dualari_eslestir, bootstyle=(SECONDARY, OUTLINE))
btn_esle.pack(fill=X)

load_data()
guncelle_combo_tur()
guncelle_combo_listeler()
guncelle_sol_tablo()
guncelle_sag_tablo()

# Açılışta GitHub ile yerel depoyu karşılaştır (fark / eksik / fazla)
github_ile_karsilastir(sessiz=False)

root.mainloop()
