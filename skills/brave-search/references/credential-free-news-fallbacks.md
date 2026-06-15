# Credential-free news fallback pattern

Use when the configured Brave Search / web_extract / Exa path fails with auth errors during a scheduled news digest.

## Signals

- `Unauthorized: Invalid token` from Brave search or extraction.
- `API key must be provided` from Exa.
- Repeated provider failures within the same turn.

## Do not

- Do not loop retries against the same failing provider.
- Do not claim no news just because the paid search provider failed.
- Do not call delivery tools in cron mode; final response is delivered by the scheduler.

## Minimal Python probes

### Google News RSS

```python
import urllib.parse, urllib.request, xml.etree.ElementTree as ET

q = 'OpenAI Anthropic Google Meta xAI Mistral AI model release when:1d'
url = 'https://news.google.com/rss/search?q=' + urllib.parse.quote(q) + '&hl=en-US&gl=US&ceid=US:en'
data = urllib.request.urlopen(url, timeout=15).read()
root = ET.fromstring(data)
for item in root.findall('.//item')[:8]:
    print(item.findtext('title'), item.findtext('pubDate'), item.findtext('link'))
```

### DuckDuckGo canonical URL lookup

```python
import html as htmllib, re, urllib.parse, urllib.request

q = 'IREN Nvidia AI cloud deal 3.4 billion May 2026'
req = urllib.request.Request(
    'https://duckduckgo.com/html/?q=' + urllib.parse.quote(q),
    headers={'User-Agent': 'Mozilla/5.0'},
)
page = urllib.request.urlopen(req, timeout=20).read().decode('utf-8', 'ignore')
for m in re.finditer(r'<a rel="nofollow" class="result__a" href="([^"]+)".*?>(.*?)</a>', page, re.S):
    href = htmllib.unescape(m.group(1))
    title = htmllib.unescape(re.sub('<.*?>', '', m.group(2)))
    if 'uddg=' in href:
        href = urllib.parse.parse_qs(urllib.parse.urlparse(href).query).get('uddg', [href])[0]
    print(title, href)
    break
```

### Direct page metadata

```python
import re, urllib.request

url = 'https://example.com/news'
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
page = urllib.request.urlopen(req, timeout=20).read().decode('utf-8', 'ignore')
title = re.search(r'<title[^>]*>(.*?)</title>', page, re.S | re.I)
desc = re.search(r'<meta[^>]+name=["\']description["\'][^>]+content=["\']([^"\']+)', page, re.I)
print(title.group(1).strip() if title else '')
print(desc.group(1).strip() if desc else '')
```

## Quality bar

- Prefer vendor/primary sources: OpenAI, Anthropic, Google DeepMind, NVIDIA, GitHub, Solo.io, Testkube, official government pages.
- Use reputable secondary sources only when primary is blocked or unavailable.
- Dedupe syndicated copies from MSN/AOL/news mirrors.
- Report uncertainty explicitly if a source is an aggregator or metadata-only verification.
