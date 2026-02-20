# Sample Files for Upload Testing

## Files

| File | MIME Type | Document Type | Description |
|------|-----------|---------------|-------------|
| `receipt-sample.jpg` | `image/jpeg` | receipt | コンビニレシート（6品 ¥1,134） |
| `receipt-sample.png` | `image/png` | receipt | 正式な領収書（¥38,500 清掃サービス） |
| `invoice-sample.pdf` | `application/pdf` | invoice | 請求書 INV-2025-1234（¥269,500） |
| `bank-statement-sample.csv` | `text/csv` | bank_statement | 銀行取引明細（15行） |

## Regenerating Samples

```bash
python3 samples/generate_samples.py
```

## Upload API Usage

```bash
# Basic upload
curl -X POST http://localhost:3000/api/v1/documents/upload \
  -H "Authorization: Bearer <token>" \
  -F "file=@samples/invoice-sample.pdf"

# Upload with auto OCR parsing
curl -X POST "http://localhost:3000/api/v1/documents/upload?auto_parse=true" \
  -H "Authorization: Bearer <token>" \
  -F "file=@samples/invoice-sample.pdf"
```

## Supported Formats

- PDF (`application/pdf`) - max 10MB
- JPEG (`image/jpeg`) - max 10MB
- PNG (`image/png`) - max 10MB
- WebP (`image/webp`) - max 10MB
- TIFF (`image/tiff`) - max 10MB
- CSV (`text/csv`) - max 10MB
- Excel (`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`) - max 10MB
