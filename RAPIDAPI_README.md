**Spotlight:** Search the FDA National Drug Code directory with 111,000+ products. Lookup by NDC, drug name, active ingredient, manufacturer, or DEA schedule.

Search the FDA National Drug Code directory with 111,000+ products. Look up drugs by NDC code, search by name, filter by active ingredient, manufacturer, or DEA schedule.

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/lookup` | Look up a drug by NDC code |
| GET | `/search` | Search by drug name, ingredient, or manufacturer |
| GET | `/schedule/:schedule` | List drugs by DEA schedule (CII-CV) |
| POST | `/lookup/batch` | Look up multiple NDCs at once (max 50) |
| GET | `/data-info` | Data source info and build date |

### Quick Start

```javascript
const response = await fetch('https://ndc-drug-lookup.p.rapidapi.com/search?q=metformin&limit=5', {
  headers: {
    'x-rapidapi-key': 'YOUR_API_KEY',
    'x-rapidapi-host': 'ndc-drug-lookup.p.rapidapi.com'
  }
});
const data = await response.json();
// { query: "metformin", count: 5, results: [{ ndc: "0002-1433-80", name: "Metformin HCl", genericName: "metformin hydrochloride", ... }] }
```

### Rate Limits

| Plan | Requests/month | Rate |
|------|---------------|------|
| Basic (Pay Per Use) | Unlimited | 10/min |
| Pro ($9.99/mo) | 5,000 | 50/min |
| Ultra ($29.99/mo) | 25,000 | 200/min |
| Mega ($99.99/mo) | 100,000 | 500/min |
