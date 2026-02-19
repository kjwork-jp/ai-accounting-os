# Sample Files for Upload Testing

## Files

| File | MIME Type | Document Type | Description |
|------|-----------|---------------|-------------|
| `invoice-sample.pdf` | `application/pdf` | invoice | Sample invoice (INV-2025-0042, 11,000 JPY) |
| `receipt-sample.png` | `image/png` | receipt | Sample receipt image (1,661 JPY) |
| `receipt-sample.jpg` | `image/jpeg` | receipt | Minimal JPEG receipt |
| `bank-statement-sample.csv` | `text/csv` | bank_statement | Bank transaction statement (10 rows) |

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
