"""
Generate realistic Japanese accounting document samples for OCR testing.
Run: python3 samples/generate_samples.py
"""

from PIL import Image, ImageDraw, ImageFont
import random
import os
import io

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
FONT_PATH = "/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf"
FONT_PATH_P = "/usr/share/fonts/opentype/ipafont-gothic/ipagp.ttf"


def load_fonts():
    return {
        "s": ImageFont.truetype(FONT_PATH, 20),
        "m": ImageFont.truetype(FONT_PATH, 24),
        "l": ImageFont.truetype(FONT_PATH, 30),
        "xl": ImageFont.truetype(FONT_PATH, 40),
        "mono_s": ImageFont.truetype(FONT_PATH, 18),
        "mono_m": ImageFont.truetype(FONT_PATH, 22),
        "bold_m": ImageFont.truetype(FONT_PATH_P, 24),
        "bold_l": ImageFont.truetype(FONT_PATH_P, 32),
        "bold_xl": ImageFont.truetype(FONT_PATH_P, 44),
    }


# ── 1. Convenience store receipt (thermal paper style) ──────────────────

def generate_convenience_store_receipt():
    fonts = load_fonts()
    W = 580
    BG = (252, 250, 245)  # slightly warm white like thermal paper

    # Build content first to calculate height
    lines = []

    def add(text, font_key="mono_m", align="center", gap=4):
        lines.append((text, font_key, align, gap))

    add("", "mono_s", gap=10)
    add("ファミリーストア 渋谷道玄坂店", "bold_l", gap=6)
    add("〒150-0043", "mono_s", gap=2)
    add("東京都渋谷区道玄坂2-10-7", "mono_s", gap=2)
    add("TEL: 03-3462-XXXX", "mono_s", gap=16)
    add("─" * 30, "mono_s", gap=8)
    add("2025年12月15日(月) 12:34", "mono_m", gap=2)
    add("レジ#03  担当: 山田", "mono_s", gap=8)
    add("─" * 30, "mono_s", gap=10)

    # Items
    items = [
        ("おにぎり 鮭", 160),
        ("おにぎり 明太子", 170),
        ("サンドイッチ ハムチーズ", 320),
        ("緑茶 500ml", 150),
        ("ブラックコーヒー", 130),
        ("チョコレート", 120),
    ]
    for name, price in items:
        add(f"  {name:<20s} ¥{price:>6,}", "mono_m", "left", gap=4)

    subtotal = sum(p for _, p in items)
    tax8 = int(subtotal * 0.08)
    total = subtotal + tax8

    add("─" * 30, "mono_s", gap=8)
    add(f"  小計 ({len(items)}点){' ' * 12} ¥{subtotal:>6,}", "mono_m", "left", gap=4)
    add(f"  (税率8%対象){' ' * 12} ¥{subtotal:>6,}", "mono_s", "left", gap=2)
    add(f"  (内消費税8%){' ' * 12} ¥{tax8:>6,}", "mono_s", "left", gap=6)
    add("─" * 30, "mono_s", gap=8)
    add(f"  合計{' ' * 20} ¥{total:>6,}", "bold_l", "left", gap=6)
    add(f"  (税込)", "mono_s", "left", gap=8)
    add("─" * 30, "mono_s", gap=6)
    add(f"  お預り{' ' * 18} ¥{1200:>6,}", "mono_m", "left", gap=4)
    add(f"  お釣り{' ' * 18} ¥{1200 - total:>6,}", "mono_m", "left", gap=8)
    add("─" * 30, "mono_s", gap=10)
    add("お買い上げありがとうございます", "mono_s", gap=4)
    add("", "mono_s", gap=4)
    add("T1234567890123", "mono_s", gap=2)
    add("登録番号: T1-2345-6789-0123", "mono_s", gap=16)

    # Fake barcode area
    add("||||| |||| ||||| |||| ||||| ||||", "mono_s", gap=2)
    add("1234 5678 9012 3456", "mono_s", gap=10)

    # Calculate height
    y = 20
    for text, font_key, align, gap in lines:
        font = fonts[font_key]
        bbox = font.getbbox(text) if text.strip() else (0, 0, 0, 20)
        y += (bbox[3] - bbox[1]) + gap
    H = y + 20

    img = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(img)

    # Add subtle thermal paper texture
    random.seed(42)
    for _ in range(300):
        x = random.randint(0, W - 1)
        yy = random.randint(0, H - 1)
        c = random.randint(235, 252)
        draw.point((x, yy), fill=(c, c - 3, c - 8))

    y = 20
    for text, font_key, align, gap in lines:
        font = fonts[font_key]
        bbox = font.getbbox(text) if text.strip() else (0, 0, 0, 20)
        text_w = bbox[2] - bbox[0]
        text_h = bbox[3] - bbox[1]
        if align == "center":
            x = (W - text_w) // 2
        else:
            x = 30
        color = (30, 30, 35)
        draw.text((x, y), text, fill=color, font=font)
        y += text_h + gap

    out = os.path.join(SCRIPT_DIR, "receipt-sample.jpg")
    img.save(out, "JPEG", quality=88)
    print(f"  -> {out} ({os.path.getsize(out):,} bytes)")


# ── 2. Formal receipt / 領収書 (PNG) ────────────────────────────────────

def generate_formal_receipt():
    fonts = load_fonts()
    W, H = 800, 560
    BG = (255, 255, 255)

    img = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(img)

    # Border
    draw.rectangle([20, 20, W - 20, H - 20], outline=(0, 0, 0), width=2)
    draw.rectangle([24, 24, W - 24, H - 24], outline=(0, 0, 0), width=1)

    # Title
    title = "領  収  書"
    draw.text((W // 2, 55), title, fill=(0, 0, 0), font=fonts["bold_xl"], anchor="mt")

    # Date
    draw.text((W - 60, 70), "2025年11月20日", fill=(50, 50, 50), font=fonts["s"], anchor="rt")
    draw.text((W - 60, 94), "No. R-2025-0847", fill=(100, 100, 100), font=fonts["mono_s"], anchor="rt")

    # Recipient
    draw.text((60, 130), "株式会社テックスタート 御中", fill=(0, 0, 0), font=fonts["bold_l"])
    draw.line([(60, 168), (440, 168)], fill=(0, 0, 0), width=1)

    # Amount box
    draw.rectangle([60, 195, W - 60, 260], outline=(0, 0, 0), width=2)
    amount = 38500
    draw.text((80, 207), "金額", fill=(0, 0, 0), font=fonts["m"])
    draw.text((W - 80, 207), f"¥ {amount:,}－", fill=(0, 0, 0), font=fonts["bold_l"], anchor="rt")

    # Details
    draw.text((60, 285), "但し  12月分オフィス清掃サービス料として", fill=(30, 30, 30), font=fonts["m"])
    draw.line([(60, 315), (520, 315)], fill=(100, 100, 100), width=1)

    # Tax breakdown
    draw.text((60, 335), f"税抜金額:  ¥{35000:,}", fill=(80, 80, 80), font=fonts["s"])
    draw.text((60, 360), f"消費税(10%):  ¥{3500:,}", fill=(80, 80, 80), font=fonts["s"])

    # Stamp area (red circle)
    draw.text((60, 405), "上記正に領収いたしました。", fill=(50, 50, 50), font=fonts["s"])

    # Issuer
    draw.text((W - 60, 430), "クリーンサポート株式会社", fill=(0, 0, 0), font=fonts["bold_m"], anchor="rt")
    draw.text((W - 60, 460), "〒160-0023", fill=(80, 80, 80), font=fonts["mono_s"], anchor="rt")
    draw.text((W - 60, 482), "東京都新宿区西新宿1-25-1", fill=(80, 80, 80), font=fonts["mono_s"], anchor="rt")
    draw.text((W - 60, 504), "TEL: 03-5321-XXXX", fill=(80, 80, 80), font=fonts["mono_s"], anchor="rt")
    draw.text((W - 60, 526), "登録番号: T9-0123-4567-8901", fill=(80, 80, 80), font=fonts["mono_s"], anchor="rt")

    # Red ink stamp (印鑑 style)
    cx, cy, r = W - 140, 430, 28
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], outline=(200, 30, 30), width=2)
    stamp_font = ImageFont.truetype(FONT_PATH_P, 22)
    draw.text((cx, cy), "印", fill=(200, 30, 30), font=stamp_font, anchor="mm")

    out = os.path.join(SCRIPT_DIR, "receipt-sample.png")
    img.save(out, "PNG")
    print(f"  -> {out} ({os.path.getsize(out):,} bytes)")


# ── 3. Invoice / 請求書 (PDF via Pillow -> PDF) ────────────────────────

def generate_invoice_pdf():
    fonts = load_fonts()
    # A4 at 150 DPI: 1240 x 1754
    W, H = 1240, 1754
    img = Image.new("RGB", (W, H), (255, 255, 255))
    draw = ImageDraw.Draw(img)

    # Fonts for invoice (larger for A4)
    f_title = ImageFont.truetype(FONT_PATH_P, 52)
    f_large = ImageFont.truetype(FONT_PATH_P, 34)
    f_medium = ImageFont.truetype(FONT_PATH, 26)
    f_small = ImageFont.truetype(FONT_PATH, 22)
    f_mono = ImageFont.truetype(FONT_PATH, 24)
    f_bold = ImageFont.truetype(FONT_PATH_P, 28)

    # Title
    draw.text((W // 2, 80), "請  求  書", fill=(0, 0, 0), font=f_title, anchor="mt")
    draw.line([(80, 130), (W - 80, 130)], fill=(0, 0, 0), width=2)

    # Date & invoice number
    draw.text((W - 100, 160), "2025年12月01日", fill=(50, 50, 50), font=f_medium, anchor="rt")
    draw.text((W - 100, 194), "請求書番号: INV-2025-1234", fill=(80, 80, 80), font=f_small, anchor="rt")

    # Recipient
    y = 170
    draw.text((100, y), "株式会社テックスタート 御中", fill=(0, 0, 0), font=f_large)
    y += 44
    draw.line([(100, y), (540, y)], fill=(0, 0, 0), width=1)
    y += 14
    draw.text((100, y), "〒150-0001 東京都渋谷区神宮前3-5-10", fill=(80, 80, 80), font=f_small)

    # Greeting
    y = 290
    draw.text((100, y), "下記のとおりご請求申し上げます。", fill=(30, 30, 30), font=f_medium)

    # Total amount box
    y = 340
    draw.rectangle([100, y, W - 100, y + 70], outline=(0, 0, 0), width=2)
    draw.rectangle([100, y, 280, y + 70], fill=(240, 240, 240), outline=(0, 0, 0), width=2)
    draw.text((190, y + 18), "合計金額", fill=(0, 0, 0), font=f_bold, anchor="mt")
    total = 269500
    draw.text((W - 140, y + 18), f"¥ {total:,}（税込）", fill=(0, 0, 0), font=f_large, anchor="rt")

    # Payment info
    y = 440
    draw.text((100, y), "お支払期限: 2025年12月31日", fill=(0, 0, 0), font=f_medium)
    y += 32
    draw.text((100, y), "振込先: みずほ銀行 渋谷支店 普通 1234567", fill=(0, 0, 0), font=f_medium)
    y += 32
    draw.text((100, y), "口座名義: カ）エーアイソリューションズ", fill=(0, 0, 0), font=f_medium)

    # Table header
    y = 560
    cols = [100, 600, 760, 920, W - 100]
    header_labels = ["品名・摘要", "数量", "単価", "金額"]
    draw.rectangle([cols[0], y, cols[-1], y + 44], fill=(50, 50, 70), outline=(0, 0, 0), width=1)
    for i, label in enumerate(header_labels):
        cx = (cols[i] + cols[i + 1]) // 2
        draw.text((cx, y + 10), label, fill=(255, 255, 255), font=f_bold, anchor="mt")

    # Table rows
    items = [
        ("AIチャットボット開発費（11月分）", "1", "150,000", "150,000"),
        ("クラウドサーバー利用料（11月分）", "1", "45,000", "45,000"),
        ("データ分析レポート作成", "2", "25,000", "50,000"),
    ]
    y += 44
    for item_name, qty, unit_price, amount_str in items:
        draw.rectangle([cols[0], y, cols[-1], y + 44], outline=(180, 180, 180), width=1)
        draw.text((cols[0] + 12, y + 10), item_name, fill=(0, 0, 0), font=f_mono)
        draw.text(((cols[1] + cols[2]) // 2, y + 10), qty, fill=(0, 0, 0), font=f_mono, anchor="mt")
        draw.text((cols[2] + (cols[3] - cols[2]) // 2, y + 10), unit_price, fill=(0, 0, 0), font=f_mono, anchor="mt")
        draw.text((cols[-1] - 12, y + 10), amount_str, fill=(0, 0, 0), font=f_mono, anchor="rt")
        y += 44

    # Subtotal area
    y += 10
    subtotal = 245000
    tax10 = 24500
    draw.line([(cols[2], y), (cols[-1], y)], fill=(0, 0, 0), width=1)
    y += 10
    draw.text((cols[2] + 10, y), "小計", fill=(0, 0, 0), font=f_bold)
    draw.text((cols[-1] - 12, y), f"¥{subtotal:,}", fill=(0, 0, 0), font=f_mono, anchor="rt")
    y += 36
    draw.text((cols[2] + 10, y), "消費税(10%)", fill=(0, 0, 0), font=f_medium)
    draw.text((cols[-1] - 12, y), f"¥{tax10:,}", fill=(0, 0, 0), font=f_mono, anchor="rt")
    y += 36
    draw.line([(cols[2], y), (cols[-1], y)], fill=(0, 0, 0), width=2)
    y += 8
    draw.text((cols[2] + 10, y), "合計", fill=(0, 0, 0), font=f_large)
    draw.text((cols[-1] - 12, y), f"¥{total:,}", fill=(0, 0, 0), font=f_large, anchor="rt")

    # Remarks
    y += 80
    draw.text((100, y), "備考:", fill=(0, 0, 0), font=f_bold)
    y += 34
    draw.text((100, y), "・お振込手数料はお客様のご負担でお願いいたします。", fill=(80, 80, 80), font=f_small)
    y += 28
    draw.text((100, y), "・ご不明な点がございましたらお問い合わせください。", fill=(80, 80, 80), font=f_small)

    # Issuer section (bottom right)
    y = H - 360
    draw.line([(W // 2, y), (W - 100, y)], fill=(180, 180, 180), width=1)
    y += 16
    draw.text((W - 100, y), "株式会社AIソリューションズ", fill=(0, 0, 0), font=f_large, anchor="rt")
    y += 42
    draw.text((W - 100, y), "〒150-0043 東京都渋谷区道玄坂1-12-1", fill=(80, 80, 80), font=f_small, anchor="rt")
    y += 28
    draw.text((W - 100, y), "TEL: 03-6789-0123  FAX: 03-6789-0124", fill=(80, 80, 80), font=f_small, anchor="rt")
    y += 28
    draw.text((W - 100, y), "Email: info@ai-solutions.example.co.jp", fill=(80, 80, 80), font=f_small, anchor="rt")
    y += 28
    draw.text((W - 100, y), "適格請求書発行事業者登録番号: T3-0109-0100-1234", fill=(80, 80, 80), font=f_small, anchor="rt")

    # Company stamp
    cx, cy, r = W - 240, H - 310, 44
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], outline=(200, 30, 30), width=3)
    stamp_font = ImageFont.truetype(FONT_PATH_P, 24)
    draw.text((cx, cy - 12), "AI", fill=(200, 30, 30), font=stamp_font, anchor="mm")
    draw.text((cx, cy + 14), "ソリュ", fill=(200, 30, 30), font=stamp_font, anchor="mm")

    out = os.path.join(SCRIPT_DIR, "invoice-sample.pdf")
    img.save(out, "PDF", resolution=150)
    print(f"  -> {out} ({os.path.getsize(out):,} bytes)")


# ── 4. Bank statement CSV ──────────────────────────────────────────────

def generate_bank_statement_csv():
    csv_content = """取引日,摘要,お支払金額,お預り金額,残高,メモ
2025/11/01,振込 カ）テックスタート,,500000,3245800,売上入金
2025/11/05,振込手数料,440,,3245360,
2025/11/05,振込 ﾔﾏﾀﾞ ﾀﾛｳ,150000,,3095360,給与11月分
2025/11/05,振込 ｽｽﾞｷ ﾊﾅｺ,150000,,2945360,給与11月分
2025/11/05,振込 ﾀﾅｶ ｹﾝｼﾞ,180000,,2765360,給与11月分
2025/11/10,口座振替 東京電力EP,12800,,2752560,電気代11月
2025/11/10,口座振替 東京ガス,6540,,2746020,ガス代11月
2025/11/10,口座振替 NTTコミュニケーションズ,8800,,2737220,通信費11月
2025/11/15,カード引落 ｱﾒﾘｶﾝEX,345600,,2391620,法人カード10月利用分
2025/11/20,振込 カ）ABCコンサルティング,,220000,2611620,コンサル料入金
2025/11/25,口座振替 渋谷区役所,53200,,2558420,社会保険料
2025/11/25,口座振替 渋谷税務署,89000,,2469420,源泉所得税
2025/11/28,振込 カ）クリーンサポート,38500,,2430920,清掃費12月分
2025/11/29,ATM引出し,50000,,2380920,小口現金補充
2025/11/30,利息,,12,2380932,普通預金利息
"""
    out = os.path.join(SCRIPT_DIR, "bank-statement-sample.csv")
    with open(out, "w", encoding="utf-8-sig") as f:
        f.write(csv_content.strip() + "\n")
    print(f"  -> {out} ({os.path.getsize(out):,} bytes)")


# ── Main ──

if __name__ == "__main__":
    print("Generating sample documents...")
    print()
    print("[1/4] Convenience store receipt (JPEG)")
    generate_convenience_store_receipt()
    print("[2/4] Formal receipt / 領収書 (PNG)")
    generate_formal_receipt()
    print("[3/4] Invoice / 請求書 (PDF)")
    generate_invoice_pdf()
    print("[4/4] Bank statement (CSV)")
    generate_bank_statement_csv()
    print()
    print("Done!")
