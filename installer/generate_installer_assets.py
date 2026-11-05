# -*- coding: utf-8 -*-
import os
import math
from PIL import Image, ImageDraw, ImageFont, ImageFilter

os.makedirs('installer/assets', exist_ok=True)
os.makedirs('src-tauri/icons', exist_ok=True)

def load_font(size, bold=False):
    candidates = [
        'C:/Windows/Fonts/segoeuib.ttf' if bold else 'C:/Windows/Fonts/segoeui.ttf',
        'C:/Windows/Fonts/arialbd.ttf' if bold else 'C:/Windows/Fonts/arial.ttf',
        'C:/Windows/Fonts/calibrib.ttf' if bold else 'C:/Windows/Fonts/calibri.ttf',
    ]
    for path in candidates:
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()

# ==============================================================================
# 1. APPLICATION ICON (1024x1024 supersampled -> 256, 128, 64, 48, 32, 16 .ico)
# ==============================================================================
def build_app_icon():
    S = 1024
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Outer squircle shadow & gradient background (Deep Royal Navy -> Vibrant Blue)
    margin = 44
    radius = 220

    # Create gradient background
    bg = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    bg_px = bg.load()
    for y in range(S):
        t = y / float(S - 1)
        # Top: #0f2547 -> Middle: #133b6e -> Bottom: #09172e
        if t < 0.5:
            u = t * 2.0
            r = int(15 * (1 - u) + 22 * u)
            g = int(37 * (1 - u) + 68 * u)
            b = int(71 * (1 - u) + 128 * u)
        else:
            u = (t - 0.5) * 2.0
            r = int(22 * (1 - u) + 8 * u)
            g = int(68 * (1 - u) + 20 * u)
            b = int(128 * (1 - u) + 46 * u)
        for x in range(S):
            bg_px[x, y] = (r, g, b, 255)

    mask = Image.new('L', (S, S), 0)
    mdraw = ImageDraw.Draw(mask)
    mdraw.rounded_rectangle([margin, margin, S - margin, S - margin], radius=radius, fill=255)

    img = Image.composite(bg, img, mask)
    draw = ImageDraw.Draw(img)

    # Glowing border around squircle
    draw.rounded_rectangle(
        [margin, margin, S - margin, S - margin],
        radius=radius,
        outline=(56, 189, 248, 230),
        width=16
    )
    draw.rounded_rectangle(
        [margin + 18, margin + 18, S - margin - 18, S - margin - 18],
        radius=radius - 16,
        outline=(255, 255, 255, 55),
        width=6
    )

    # Stage Curtains / Spotlight subtle top arc
    for i in range(6):
        alpha = int(35 - i * 5)
        draw.pieslice(
            [180 - i * 20, -220, S - 180 + i * 20, 520 + i * 25],
            start=35, end=145,
            fill=(56, 189, 248, alpha)
        )

    # LED Stage Display Monitor Frame (Center)
    mon_left, mon_top, mon_right, mon_bottom = 135, 195, 889, 675
    # Monitor outer bezel (Gold / Silver-Blue metallic frame)
    draw.rounded_rectangle(
        [mon_left - 14, mon_top - 14, mon_right + 14, mon_bottom + 14],
        radius=54,
        fill=(15, 23, 42, 235),
        outline=(250, 204, 21, 245),
        width=14
    )

    # Inner screen gradient (Stage screen)
    scr = Image.new('RGBA', (mon_right - mon_left, mon_bottom - mon_top), (0, 0, 0, 255))
    scr_px = scr.load()
    sw, sh = scr.size
    for sy in range(sh):
        ty = sy / float(sh - 1)
        for sx in range(sw):
            tx = sx / float(sw - 1)
            # Radial-ish stage blue/cyan glow
            dx = tx - 0.5
            dy = ty - 0.45
            dist = math.sqrt(dx * dx + dy * dy)
            glow = max(0.0, 1.0 - dist * 1.35)
            r = int(12 + glow * 28)
            g = int(28 + glow * 115)
            b = int(58 + glow * 165)
            scr_px[sx, sy] = (r, g, b, 255)

    scr_mask = Image.new('L', (sw, sh), 0)
    ImageDraw.Draw(scr_mask).rounded_rectangle([0, 0, sw - 1, sh - 1], radius=40, fill=255)
    img.paste(scr, (mon_left, mon_top), scr_mask)
    draw = ImageDraw.Draw(img)

    # LED Grid subtle top header bar inside monitor ("CANLI / REJİ")
    draw.rounded_rectangle(
        [mon_left + 32, mon_top + 28, mon_left + 235, mon_top + 82],
        radius=24,
        fill=(220, 38, 38, 240)
    )
    draw.ellipse([mon_left + 50, mon_top + 43, mon_left + 74, mon_top + 67], fill=(255, 255, 255, 255))
    f_live = load_font(34, bold=True)
    draw.text((mon_left + 88, mon_top + 35), "REJİ", font=f_live, fill=(255, 255, 255, 255))

    # Center Play / Broadcast Circle + Triangle inside screen
    cx, cy = 512, 425
    cr = 122
    draw.ellipse([cx - cr - 10, cy - cr - 10, cx + cr + 10, cy + cr + 10], fill=(14, 165, 233, 75))
    draw.ellipse(
        [cx - cr, cy - cr, cx + cr, cy + cr],
        fill=(2, 132, 199, 245),
        outline=(255, 255, 255, 245),
        width=12
    )
    # Crisp Play triangle
    tri = [
        (cx - 38, cy - 64),
        (cx - 38, cy + 64),
        (cx + 68, cy)
    ]
    draw.polygon(tri, fill=(255, 255, 255, 255))

    # Equalizer / Sound Wave Bars on left and right of Play circle inside monitor
    bar_heights_left = [55, 95, 135, 80]
    for idx, bh in enumerate(bar_heights_left):
        bx = mon_left + 68 + idx * 44
        draw.rounded_rectangle(
            [bx, cy - bh // 2, bx + 24, cy + bh // 2],
            radius=12,
            fill=(56, 189, 248, 235)
        )
    bar_heights_right = [80, 135, 95, 55]
    for idx, bh in enumerate(bar_heights_right):
        bx = cx + cr + 48 + idx * 44
        draw.rounded_rectangle(
            [bx, cy - bh // 2, bx + 24, cy + bh // 2],
            radius=12,
            fill=(56, 189, 248, 235)
        )

    # Monitor Stand & Reji Console Deck at the bottom
    # Stand neck
    draw.rectangle([462, 675, 562, 745], fill=(148, 163, 184, 255))
    # Reji Console Mixer Deck base
    deck_l, deck_t, deck_r, deck_b = 220, 735, 804, 875
    draw.rounded_rectangle(
        [deck_l, deck_t, deck_r, deck_b],
        radius=38,
        fill=(15, 23, 42, 250),
        outline=(56, 189, 248, 220),
        width=10
    )
    # Fader sliders & glowing pads on the Reji console deck
    pad_colors = [
        (239, 68, 68, 255),   # Red Live pad
        (245, 158, 11, 255),  # Amber Preview pad
        (16, 185, 129, 255),  # Emerald Loop pad
        (59, 130, 246, 255),  # Blue Audio pad
        (168, 85, 247, 255),  # Purple FX pad
    ]
    for i, col in enumerate(pad_colors):
        px = deck_l + 52 + i * 102
        py = deck_t + 36
        draw.rounded_rectangle([px, py, px + 72, py + 68], radius=16, fill=col, outline=(255, 255, 255, 190), width=4)

    # Top-Right Official MEB Badge overlay for unmistakable institutional identity
    top_logo_path = 'ui/assets/welcome_top_logo.png'
    if os.path.exists(top_logo_path):
        meb = Image.open(top_logo_path).convert('RGBA')
        badge_size = 240
        meb = meb.resize((badge_size, badge_size), Image.Resampling.LANCZOS)
        bx, by = S - badge_size - 72, 72
        # White circular backing with gold ring
        draw.ellipse([bx - 8, by - 8, bx + badge_size + 8, by + badge_size + 8], fill=(255, 255, 255, 255), outline=(250, 204, 21, 255), width=10)
        img.paste(meb, (bx, by), meb)

    # Save 256x256 PNG and multi-size ICO
    icon_256 = img.resize((256, 256), Image.Resampling.LANCZOS)
    icon_256.save('src-tauri/icons/icon.png', format='PNG')
    icon_512 = img.resize((512, 512), Image.Resampling.LANCZOS)
    icon_512.save('installer/assets/app_icon_512.png', format='PNG')

    # Save multi-resolution ICO (16, 24, 32, 48, 64, 128, 256)
    img.save(
        'src-tauri/icons/icon.ico',
        format='ICO',
        sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    )
    img.save(
        'installer/assets/setup_icon.ico',
        format='ICO',
        sizes=[(16, 16), (32, 32), (48, 48), (256, 256)],
        bitmap_format='bmp'
    )
    print("App icon generated successfully.")

# ==============================================================================
# 2. MODAL-WELCOME-SPLASH CARD FOR INNO SETUP WIZARD
# ==============================================================================
def build_welcome_splash_images():
    # Build the exact card from //*[@id="modal-welcome-splash"]/div
    # Dimensions: 994 x 628 (2x hi-DPI for Inno Setup welcome page / custom card)
    W, H = 994, 628
    canvas = Image.new('RGBA', (W, H), (226, 234, 244, 255))
    cdraw = ImageDraw.Draw(canvas)

    # Corporate blue-grey gradient background (matching .welcome-modal-backdrop)
    px = canvas.load()
    for y in range(H):
        ty = y / float(H - 1)
        for x in range(W):
            tx = x / float(W - 1)
            r = int(214 * (1 - ty) + 195 * ty)
            g = int(226 * (1 - ty) + 212 * ty)
            b = int(240 * (1 - ty) + 232 * ty)
            px[x, y] = (r, g, b, 255)

    # White card container with soft shadow
    card_l, card_t, card_r, card_b = 48, 86, W - 48, H - 34
    # Soft drop shadow
    shadow = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    sdraw = ImageDraw.Draw(shadow)
    sdraw.rounded_rectangle([card_l + 4, card_t + 10, card_r + 4, card_b + 12], radius=32, fill=(15, 23, 42, 48))
    shadow = shadow.filter(ImageFilter.GaussianBlur(12))
    canvas = Image.alpha_composite(canvas, shadow)
    cdraw = ImageDraw.Draw(canvas)

    # Card body
    cdraw.rounded_rectangle([card_l, card_t, card_r, card_b], radius=28, fill=(255, 255, 255, 255), outline=(226, 232, 240, 255), width=2)
    # Subtle lower card tint
    cdraw.rounded_rectangle([card_l + 2, card_t + 175, card_r - 2, card_b - 2], radius=26, fill=(246, 249, 253, 255))

    # Top centered MEB circle badge intersecting top edge
    top_logo = Image.open('ui/assets/welcome_top_logo.png').convert('RGBA')
    t_size = 128
    top_logo = top_logo.resize((t_size, t_size), Image.Resampling.LANCZOS)
    tx = (W - t_size) // 2
    ty = card_t - t_size // 2 + 6
    cdraw.ellipse([tx - 6, ty - 6, tx + t_size + 6, ty + t_size + 6], fill=(255, 255, 255, 255), outline=(226, 232, 240, 255), width=3)
    canvas.paste(top_logo, (tx, ty), top_logo)

    # Headings:
    # "T.C. MİLLÎ EĞİTİM BAKANLIĞI"
    # "MARDİN İL MİLLÎ EĞİTİM MÜDÜRLÜĞÜ"
    f_h1 = load_font(28, bold=True)
    f_h2 = load_font(27, bold=True)

    t1 = "T.C. MİLLÎ EĞİTİM BAKANLIĞI"
    t2 = "MARDİN İL MİLLÎ EĞİTİM MÜDÜRLÜĞÜ"
    b1 = cdraw.textbbox((0, 0), t1, font=f_h1)
    b2 = cdraw.textbbox((0, 0), t2, font=f_h2)
    cdraw.text(((W - (b1[2] - b1[0])) // 2, card_t + 76), t1, font=f_h1, fill=(15, 29, 64, 255))
    cdraw.text(((W - (b2[2] - b2[0])) // 2, card_t + 114), t2, font=f_h2, fill=(15, 29, 64, 255))

    # Gold/Grey subtle horizontal divider line
    div_y = card_t + 166
    cdraw.line([(card_l + 70, div_y), (card_r - 70, div_y)], fill=(212, 196, 168, 220), width=2)

    # Middle Grid: Left Squircle (MEM), Center Text, Right Squircle (Sercan)
    sq_size = 156
    sq_y = card_t + 225
    left_sq_x = card_l + 96
    right_sq_x = card_r - 96 - sq_size

    # Left squircle box with Mardin MEM light logo
    cdraw.rounded_rectangle(
        [left_sq_x - 3, sq_y + 4, left_sq_x + sq_size + 3, sq_y + sq_size + 8],
        radius=28, fill=(15, 23, 42, 22)
    )
    cdraw.rounded_rectangle(
        [left_sq_x, sq_y, left_sq_x + sq_size, sq_y + sq_size],
        radius=28, fill=(255, 255, 255, 255), outline=(30, 41, 59, 230), width=3
    )
    mem_logo = Image.open('ui/assets/welcome_mem_light.png').convert('RGBA')
    mem_pad = 14
    mem_logo = mem_logo.resize((sq_size - mem_pad * 2, sq_size - mem_pad * 2), Image.Resampling.LANCZOS)
    canvas.paste(mem_logo, (left_sq_x + mem_pad, sq_y + mem_pad), mem_logo)

    # Right squircle box with Sercan Özdemir logo
    cdraw.rounded_rectangle(
        [right_sq_x - 3, sq_y + 4, right_sq_x + sq_size + 3, sq_y + sq_size + 8],
        radius=28, fill=(15, 23, 42, 22)
    )
    cdraw.rounded_rectangle(
        [right_sq_x, sq_y, right_sq_x + sq_size, sq_y + sq_size],
        radius=28, fill=(255, 255, 255, 255), outline=(203, 213, 225, 255), width=3
    )
    sercan_logo = Image.open('ui/assets/welcome_sercan.png').convert('RGBA')
    s_pad = 12
    sercan_logo = sercan_logo.resize((sq_size - s_pad * 2, sq_size - s_pad * 2), Image.Resampling.LANCZOS)
    canvas.paste(sercan_logo, (right_sq_x + s_pad, sq_y + s_pad), sercan_logo)

    # Center Texts:
    # "Bu uygulama, Mardin İl Millî Eğitim Müdürlüğü adına"
    # "SERCAN ÖZDEMİR"
    # "tarafından geliştirilmiştir."
    f_top = load_font(24, bold=False)
    f_author = load_font(31, bold=True)
    f_bot = load_font(25, bold=False)

    p1 = "Bu uygulama, Mardin İl Millî Eğitim Müdürlüğü adına"
    p2 = "SERCAN ÖZDEMİR"
    p3 = "tarafından geliştirilmiştir."

    bp1 = cdraw.textbbox((0, 0), p1, font=f_top)
    bp2 = cdraw.textbbox((0, 0), p2, font=f_author)
    bp3 = cdraw.textbbox((0, 0), p3, font=f_bot)

    cdraw.text(((W - (bp1[2] - bp1[0])) // 2, card_t + 184), p1, font=f_top, fill=(15, 23, 42, 255))
    cdraw.text(((W - (bp2[2] - bp2[0])) // 2, sq_y + 38), p2, font=f_author, fill=(10, 25, 68, 255))
    cdraw.text(((W - (bp3[2] - bp3[0])) // 2, sq_y + 88), p3, font=f_bot, fill=(15, 23, 42, 255))

    # Bottom pill badge ("Master-Display v2.0 — Kurulum Sihirbazı")
    btn_w, btn_h = 330, 56
    btn_x = (W - btn_w) // 2
    btn_y = card_b - 82
    cdraw.rounded_rectangle(
        [btn_x, btn_y, btn_x + btn_w, btn_y + btn_h],
        radius=18,
        fill=(18, 84, 216, 255)
    )
    f_btn = load_font(22, bold=True)
    bt_txt = "Master-Display Kurulumu"
    bbt = cdraw.textbbox((0, 0), bt_txt, font=f_btn)
    cdraw.text(
        ((W - (bbt[2] - bbt[0])) // 2, btn_y + 13),
        bt_txt,
        font=f_btn,
        fill=(255, 255, 255, 255)
    )

    canvas.convert('RGB').save('installer/assets/welcome_card.bmp', format='BMP')
    canvas.save('installer/assets/welcome_card.png', format='PNG')

    # Also build Side Banner (328 x 628) for standard wizard pages if needed
    side_w, side_h = 328, 628
    side = Image.new('RGBA', (side_w, side_h), (225, 234, 245, 255))
    s_px = side.load()
    for y in range(side_h):
        ty = y / float(side_h - 1)
        for x in range(side_w):
            s_px[x, y] = (
                int(238 * (1 - ty) + 210 * ty),
                int(244 * (1 - ty) + 224 * ty),
                int(252 * (1 - ty) + 242 * ty),
                255
            )
    sdraw = ImageDraw.Draw(side)
    sdraw.rounded_rectangle([14, 16, side_w - 14, side_h - 16], radius=22, fill=(255, 255, 255, 255), outline=(203, 213, 225, 255), width=2)

    # Top MEB logo
    tl = Image.open('ui/assets/welcome_top_logo.png').convert('RGBA').resize((110, 110), Image.Resampling.LANCZOS)
    side.paste(tl, ((side_w - 110) // 2, 30), tl)

    fs1 = load_font(15, bold=True)
    fs2 = load_font(14, bold=True)
    for idx_t, line_t in enumerate(["T.C. MİLLÎ EĞİTİM BAKANLIĞI", "MARDİN İL MİLLÎ EĞİTİM", "MÜDÜRLÜĞÜ"]):
        f_use = fs1 if idx_t == 0 else fs2
        bb = sdraw.textbbox((0, 0), line_t, font=f_use)
        sdraw.text(((side_w - (bb[2] - bb[0])) // 2, 152 + idx_t * 22), line_t, font=f_use, fill=(15, 29, 64, 255))

    sdraw.line([(36, 228), (side_w - 36, 228)], fill=(212, 196, 168, 220), width=2)

    # Two squircle logos side by side
    sq_s = 104
    lx = 38
    rx = side_w - 38 - sq_s
    sy = 248
    sdraw.rounded_rectangle([lx, sy, lx + sq_s, sy + sq_s], radius=20, fill=(255, 255, 255, 255), outline=(30, 41, 59, 220), width=2)
    ml = Image.open('ui/assets/welcome_mem_light.png').convert('RGBA').resize((sq_s - 16, sq_s - 16), Image.Resampling.LANCZOS)
    side.paste(ml, (lx + 8, sy + 8), ml)

    sdraw.rounded_rectangle([rx, sy, rx + sq_s, sy + sq_s], radius=20, fill=(255, 255, 255, 255), outline=(203, 213, 225, 255), width=2)
    sl = Image.open('ui/assets/welcome_sercan.png').convert('RGBA').resize((sq_s - 14, sq_s - 14), Image.Resampling.LANCZOS)
    side.paste(sl, (rx + 7, sy + 7), sl)

    fs_body = load_font(14, bold=False)
    fs_auth = load_font(20, bold=True)
    lines_mid = [
        ("Bu uygulama,", fs_body, (30, 41, 59, 255), 374),
        ("Mardin İl Millî Eğitim Müdürlüğü", fs_body, (30, 41, 59, 255), 396),
        ("adına", fs_body, (30, 41, 59, 255), 418),
        ("SERCAN ÖZDEMİR", fs_auth, (10, 25, 68, 255), 450),
        ("tarafından geliştirilmiştir.", fs_body, (30, 41, 59, 255), 484),
    ]
    for txt, fnt, col, yy in lines_mid:
        bb = sdraw.textbbox((0, 0), txt, font=fnt)
        sdraw.text(((side_w - (bb[2] - bb[0])) // 2, yy), txt, font=fnt, fill=col)

    # Bottom badge on side panel
    sdraw.rounded_rectangle([36, 540, side_w - 36, 586], radius=14, fill=(18, 84, 216, 255))
    fs_b = load_font(15, bold=True)
    btxt = "Master-Display v2.0"
    bbb = sdraw.textbbox((0, 0), btxt, font=fs_b)
    sdraw.text(((side_w - (bbb[2] - bbb[0])) // 2, 552), btxt, font=fs_b, fill=(255, 255, 255, 255))

    side.convert('RGB').save('installer/assets/wizard_side.bmp', format='BMP')

    # Small top-right wizard image (110 x 116)
    sm_w, sm_h = 110, 116
    sm = Image.new('RGBA', (sm_w, sm_h), (255, 255, 255, 255))
    tl_sm = Image.open('ui/assets/welcome_top_logo.png').convert('RGBA').resize((96, 96), Image.Resampling.LANCZOS)
    sm.paste(tl_sm, ((sm_w - 96) // 2, (sm_h - 96) // 2), tl_sm)
    sm.convert('RGB').save('installer/assets/wizard_small.bmp', format='BMP')
    print("Welcome splash wizard images generated successfully.")

if __name__ == '__main__':
    build_app_icon()
    build_welcome_splash_images()
