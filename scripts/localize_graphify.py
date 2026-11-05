"""
Graphify Türkçe Görselleştirme Yerelleştirici (Turkish Visualizer)
Bu betik, graph.html ve callflow.html dosyalarındaki başlıkları, kullanıcı arayüzünü,
tablo başlıklarını ve açıklamaları Türkçe'ye çevirir; kod sembollerine, dosya yollarına
ve JavaScript mantığına kesinlikle dokunmaz.
"""

import os
import re
from pathlib import Path

def localize_graph_html(file_path: Path):
    if not file_path.exists():
        print(f"Uyarı: {file_path} bulunamadı.")
        return False

    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()

    replacements = [
        # Başlık ve Temalar
        ("<title>graphify - ", "<title>Graphify Bilgi Grafiği - "),
        ('aria-label="Theme"', 'aria-label="Görünüm Teması"'),
        ('>Light</button>', '>Açık</button>'),
        ('>Dark</button>', '>Koyu</button>'),
        ('>System</button>', '>Sistem</button>'),
        
        # Arama ve Panel
        ('placeholder="Search nodes..."', 'placeholder="Düğüm veya fonksiyon ara..."'),
        ('<h3>Node Info</h3>', '<h3>Düğüm Bilgisi</h3>'),
        ('<span class="empty">Click a node to inspect it</span>', '<span class="empty">Detayları görmek için bir düğüme tıklayın</span>'),
        ('<h3>Communities</h3>', '<h3>Modüller ve Topluluklar</h3>'),
        ('>Select All</label>', '>Tümünü Seç</label>'),
        
        # JS İçindeki Bilgi Alanı Etiketleri
        ('Type: ${esc(n.file_type || \'unknown\')}', 'Tür: ${esc(n.file_type || \'bilinmiyor\')}'),
        ('Community: ${esc(n.community_name || \'\')}', 'Topluluk/Modül: ${esc(n.community_name || \'\')}'),
        ('Source: ${esc(n.source_file || \'-\')}', 'Kaynak Dosya: ${esc(n.source_file || \'-\')}'),
        ('Members: ${esc(n.member_count)}', 'Üye Sayısı: ${esc(n.member_count)}'),
        ('Degree: ${n.degree}', 'Bağlantı Sayısı: ${n.degree}'),
        ('Neighbors (${neighborIds.length})', 'Bağlantılı Komşular (${neighborIds.length})'),
        
        # İstatistikler alt çubuğu
        (' nodes &middot; ', ' düğüm &middot; '),
        (' edges &middot; ', ' bağlantı &middot; '),
        (' communities', ' topluluk'),
    ]

    for en, tr in replacements:
        content = content.replace(en, tr)

    with open(file_path, "w", encoding="utf-8") as f:
        f.write(content)

    print(f"✓ {file_path.name} Türkçe başlık ve etiketlerle güncellendi.")
    return True


def localize_callflow_html(file_path: Path):
    if not file_path.exists():
        print(f"Uyarı: {file_path} bulunamadı.")
        return False

    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()

    replacements = [
        # Üst Başlıklar & Belge Başlığı
        ("<title>Call Flow &amp; Architecture Documentation - ", "<title>Çağrı Akışı ve Mimari Dokümantasyonu - "),
        ("— Complete Call Flow &amp; Architecture Documentation", "— Tam Çağrı Akışı ve Mimari Haritası"),
        ("Generated from graphify knowledge graph:", "Graphify bilgi grafiğinden üretildi:"),
        ("Commit: unknown", "Sürüm: Yerel"),
        
        # Bölüm Başlıkları
        ("1. Architecture Overview", "1. Mimari Genel Bakış"),
        ("Group Relationships (Hyperedges)", "Modül Kümeleri ve Grup İlişkileri (Hyperedges)"),
        ("Project Statistics", "Proje İstatistikleri"),
        ("<h4>Graph</h4>", "<h4>Grafik Özeti</h4>"),
        ("<h4>Edge Confidence</h4>", "<h4>Bağlantı Güvenilirlik Dağılımı</h4>"),
        ("<h4>Architecture Layers</h4>", "<h4>Mimari Katmanlar</h4>"),
        ("<h4>Core Flow</h4>", "<h4>Temel Veri Akışı</h4>"),
        ("<h4>Key Files</h4>", "<h4>Önemli Dosyalar</h4>"),
        ("<h4>Design Notes</h4>", "<h4>Tasarım Notları</h4>"),
        ("<h3>Call Details</h3>", "<h3>Çağrı ve Bağımlılık Detayları</h3>"),
        ("<h4>Graph Report Highlights</h4>", "<h4>Grafik Raporu Özeti</h4>"),

        # Tablo Başlıkları
        ("<tr><th>Layer</th><th>Nodes</th><th>Communities</th></tr>",
         "<tr><th>Katman</th><th>Düğümler</th><th>Topluluklar</th></tr>"),
        ("<tr><th>Node</th><th>Type</th><th>Caller</th><th>Callees</th><th>Description</th></tr>",
         "<tr><th>Düğüm / Sembol</th><th>Tür</th><th>Çağıran Bileşen</th><th>Hedef (Çağrılan / Bağımlılık)</th><th>Açıklama</th></tr>"),

        # Tablo Etiketleri (Tags)
        ('<span class="tag tag-func">Concept</span>', '<span class="tag tag-func">Kavram</span>'),
        ('<span class="tag tag-cmd">CLI</span>', '<span class="tag tag-cmd">CLI Komutu</span>'),
        ('<span class="tag tag-endpoint">API</span>', '<span class="tag tag-endpoint">API / Arayüz</span>'),
        ('<span class="tag tag-async">Async</span>', '<span class="tag tag-async">Asenkron</span>'),
        ('<span class="tag tag-class">Class</span>', '<span class="tag tag-class">Sınıf</span>'),
        ('<span class="tag tag-class">Component</span>', '<span class="tag tag-class">Bileşen</span>'),
        ('<span class="tag tag-func">Function</span>', '<span class="tag tag-func">Fonksiyon</span>'),

        # Toolbar Butonları & İpuçları
        ('title="Zoom out"', 'title="Uzaklaştır"'),
        ('title="Zoom in"', 'title="Yakınlaştır"'),
        ('title="Fit width"', 'title="Genişliğe Sığdır"'),
        ('title="Reset view"', 'title="Görünümü Sıfırla"'),
        ('>Fit<', '>Sığdır<'),
        ('>Reset<', '>Sıfırla<'),

        # Yaygın İfadeler
        ("No source file mapping", "Kaynak dosya eşlemesi yok"),
        ("External entry / no inbound edge", "Harici giriş / doğrudan gelen çağrı yok"),
        ("No direct outbound edge", "Doğrudan giden çağrı yok"),
        ("No high-confidence call edges detected", "Yüksek güvenilirlikte çağrı bağlantısı tespit edilmedi"),
        ("Coverage", "Kapsanan Düğümler"),

        # Mermaid Kenar İlişkileri (Sadece ok metinleri)
        (" to calls to ", " to çağırır to "),
        (" to uses to ", " to kullanır to "),
        (" to contains to ", " to içerir to "),
        (" to imports to ", " to içe aktarır to "),
        (" to method to ", " to metod to "),
        (" to explains to ", " to açıklar to "),
        (" to relates to ", " to ilişkili to "),
    ]

    for en, tr in replacements:
        content = content.replace(en, tr)

    # İstatistikler alt bölümü
    content = re.sub(r'(\d+)\s+nodes\b', r'\1 düğüm', content)
    content = re.sub(r'(\d+)\s+edges\b', r'\1 bağlantı', content)
    content = re.sub(r'(\d+)\s+communities\b', r'\1 topluluk', content)

    with open(file_path, "w", encoding="utf-8") as f:
        f.write(content)

    print(f"✓ {file_path.name} Türkçe başlık ve etiketlerle güncellendi.")
    return True


def main():
    root = Path(__file__).resolve().parent.parent
    graphify_out = root / "graphify-out"
    if not graphify_out.exists():
        print(f"Hata: {graphify_out} dizini bulunamadı. Önce 'graphify update .' çalıştırın.")
        return

    localize_graph_html(graphify_out / "graph.html")
    localize_callflow_html(graphify_out / "callflow.html")
    print("✨ Tüm Graphify görselleştirmeleri başarıyla Türkçe'ye uyarlandı!")

if __name__ == "__main__":
    main()
