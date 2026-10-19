#!/usr/bin/env python3
"""
Update harga Kalkulator Cloud AWS / Google Cloud dari sumber resmi.

  AWS  : AWS Price List Query API (boto3, butuh kredensial AWS apa saja dengan izin pricing:GetProducts)
  GCP  : Google Cloud Billing Catalog API (butuh API key dengan Cloud Billing API aktif)
  Kurs : open.er-api.com (USD -> IDR)

Contoh:
  pip install boto3
  export AWS_PROFILE=default            # atau AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY
  export GCP_API_KEY=AIza...
  python tools/update_prices.py --in data/prices.json --out prices.json

Lalu buka aplikasi > tab "Data Harga & Update" > Impor prices.json.
Pilihan: --skip-aws, --skip-gcp, --skip-fx, --selftest (uji parser tanpa internet).

Disusun oleh @letsgobram - @motivaseein
"""
import argparse, datetime, json, os, re, sys, urllib.parse, urllib.request

LOG = []
def log(msg):
    LOG.append(msg); print(msg)

# ----------------------------------------------------------------- AWS
AWS_LOCATION = {
    "us-east-1": "US East (N. Virginia)",
    "ap-southeast-1": "Asia Pacific (Singapore)",
    "ap-southeast-3": "Asia Pacific (Jakarta)",
    "ap-southeast-5": "Asia Pacific (Malaysia)",
    "ap-southeast-7": "Asia Pacific (Thailand)",
}

def _aws_first_od_price(price_list):
    """Ambil harga OnDemand USD pertama dari respons get_products (list string JSON)."""
    for raw in price_list:
        item = json.loads(raw) if isinstance(raw, str) else raw
        for term in item.get("terms", {}).get("OnDemand", {}).values():
            for dim in term.get("priceDimensions", {}).values():
                usd = float(dim.get("pricePerUnit", {}).get("USD", "0") or 0)
                if usd > 0:
                    return usd
    return None

def aws_get(client, service, filters):
    f = [{"Type": "TERM_MATCH", "Field": k, "Value": v} for k, v in filters.items()]
    resp = client.get_products(ServiceCode=service, Filters=f, MaxResults=20)
    return _aws_first_od_price(resp.get("PriceList", []))

def aws_ec2(client, itype, region):
    return aws_get(client, "AmazonEC2", {"instanceType": itype, "location": AWS_LOCATION[region], "operatingSystem": "Linux",
                                         "tenancy": "Shared", "preInstalledSw": "NA", "capacitystatus": "Used", "licenseModel": "No License required"})

def aws_rds(client, itype, region):
    return aws_get(client, "AmazonRDS", {"instanceType": itype, "location": AWS_LOCATION[region], "databaseEngine": "MySQL", "deploymentOption": "Single-AZ"})

def aws_gp3(client, region):
    return aws_get(client, "AmazonEC2", {"productFamily": "Storage", "volumeApiName": "gp3", "location": AWS_LOCATION[region]})

def update_aws(P, client):
    changed = 0
    for it in P["aws"]["compute"]:
        p = aws_ec2(client, it["type"], "us-east-1")
        if p and abs(p - it["hourly"]) > 1e-7:
            log(f"  EC2 {it['type']}: {it['hourly']} -> {p}"); it["hourly"] = p; changed += 1
        elif not p: log(f"  EC2 {it['type']}: tidak ditemukan, dilewati")
    for it in P["aws"]["db"]:
        p = aws_rds(client, it["type"], "us-east-1")
        if p and abs(p - it["hourly"]) > 1e-7:
            log(f"  RDS {it['type']}: {it['hourly']} -> {p}"); it["hourly"] = p; changed += 1
    ref_ec2, ref_db = aws_ec2(client, "m7i.large", "us-east-1"), aws_rds(client, "db.m7g.large", "us-east-1")
    ref_gp3 = aws_gp3(client, "us-east-1")
    if ref_gp3: P["aws"]["storage"]["block_gb"] = ref_gp3
    for r in P["regions"]["aws"]:
        if r["id"] not in AWS_LOCATION: continue
        for key, ref, fn in (("compute", ref_ec2, lambda: aws_ec2(client, "m7i.large", r["id"])),
                             ("db", ref_db, lambda: aws_rds(client, "db.m7g.large", r["id"])),
                             ("storage", ref_gp3, lambda: aws_gp3(client, r["id"]))):
            v = fn()
            if ref and v:
                m = round(v / ref, 3)
                if m != r["mult"][key]:
                    log(f"  pengali {key} {r['id']}: {r['mult'][key]} -> {m}"); r["mult"][key] = m; changed += 1
    return changed

# ----------------------------------------------------------------- GCP
COMPUTE_SERVICE = "6F81-5844-456A"

def _unit_price(sku):
    try:
        rates = sku["pricingInfo"][0]["pricingExpression"]["tieredRates"]
        r = next((t for t in rates if float(t.get("startUsageAmount", 0) or 0) == 0), rates[0])
        return float(r["unitPrice"].get("units", 0) or 0) + r["unitPrice"].get("nanos", 0) / 1e9
    except (KeyError, IndexError, TypeError):
        return None

def gcp_find(skus, series, kind, region):
    rx = re.compile(rf"^{series} Instance {kind} running in ", re.I)
    for s in skus:
        d = s.get("description", "")
        if not rx.match(d) or re.search(r"custom|sole tenancy|preemptible|spot|commitment", d, re.I): continue
        if s.get("category", {}).get("usageType", "OnDemand") != "OnDemand": continue
        if region not in s.get("serviceRegions", []): continue
        p = _unit_price(s)
        if p: return p
    return None

def gcp_apply(P, skus):
    changed, base = 0, {}
    for ser in ("N2", "E2"):
        base[ser] = (gcp_find(skus, ser, "Core", "us-central1"), gcp_find(skus, ser, "Ram", "us-central1"))
        log(f"  {ser} us-central1: core={base[ser][0]} ram={base[ser][1]}")
    for it in P["gcp"]["compute"]:
        ser = "N2" if it["type"].startswith("n2-") else "E2" if it["type"].startswith("e2-") else None
        if not ser or None in base[ser]: continue
        v = round(it["vcpu"] * base[ser][0] + it["ram"] * base[ser][1], 5)
        if abs(v - it["hourly"]) > 1e-6:
            log(f"  {it['type']}: {it['hourly']} -> {v}"); it["hourly"] = v; changed += 1
    if base["N2"][0]:
        for r in P["regions"]["gcp"]:
            c = gcp_find(skus, "N2", "Core", r["id"])
            if c:
                m = round(c / base["N2"][0], 3)
                if m != r["mult"]["compute"]:
                    log(f"  pengali compute {r['id']}: {r['mult']['compute']} -> {m}"); r["mult"]["compute"] = m; changed += 1
    return changed

def gcp_fetch(key):
    skus, token = [], ""
    for _ in range(30):
        q = {"currencyCode": "USD", "pageSize": 5000, "key": key}
        if token: q["pageToken"] = token
        url = f"https://cloudbilling.googleapis.com/v1/services/{COMPUTE_SERVICE}/skus?" + urllib.parse.urlencode(q)
        with urllib.request.urlopen(url, timeout=60) as r:
            j = json.load(r)
        skus += j.get("skus", []); token = j.get("nextPageToken", "")
        log(f"  {len(skus)} SKU diambil")
        if not token: break
    return skus

# ----------------------------------------------------------------- FX
def fetch_fx():
    with urllib.request.urlopen("https://open.er-api.com/v6/latest/USD", timeout=30) as r:
        return round(json.load(r)["rates"]["IDR"])

# ----------------------------------------------------------------- self test
def selftest():
    P = {"gcp": {"compute": [{"type": "n2-standard-4", "vcpu": 4, "ram": 16, "hourly": 0.1}, {"type": "e2-standard-2", "vcpu": 2, "ram": 8, "hourly": 0.1}]},
         "regions": {"gcp": [{"id": "us-central1", "mult": {"compute": 1}}, {"id": "asia-southeast2", "mult": {"compute": 1}}]}}
    def sku(desc, reg, units, nanos):
        return {"description": desc, "category": {"usageType": "OnDemand"}, "serviceRegions": [reg],
                "pricingInfo": [{"pricingExpression": {"tieredRates": [{"startUsageAmount": 0, "unitPrice": {"units": str(units), "nanos": nanos}}]}}]}
    skus = [sku("N2 Instance Core running in Americas", "us-central1", 0, 31611000), sku("N2 Instance Ram running in Americas", "us-central1", 0, 4237000),
            sku("E2 Instance Core running in Americas", "us-central1", 0, 21811000), sku("E2 Instance Ram running in Americas", "us-central1", 0, 2923000),
            sku("N2 Instance Core running in Jakarta", "asia-southeast2", 0, 42517000), sku("Spot Preemptible N2 Instance Core running in Americas", "us-central1", 0, 1)]
    gcp_apply(P, skus)
    assert abs(P["gcp"]["compute"][0]["hourly"] - 0.1942) < 1e-4, P
    assert abs(P["gcp"]["compute"][1]["hourly"] - 0.067) < 1e-4, P
    assert P["regions"]["gcp"][1]["mult"]["compute"] == 1.345, P
    od = {"terms": {"OnDemand": {"x": {"priceDimensions": {"y": {"pricePerUnit": {"USD": "0.1260000000"}}}}}}}
    assert _aws_first_od_price([json.dumps(od)]) == 0.126
    print("SELFTEST OK")

# ----------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    here = os.path.dirname(os.path.abspath(__file__))
    ap.add_argument("--in", dest="inp", default=os.path.join(here, "..", "data", "prices.json"))
    ap.add_argument("--out", default="prices.json")
    ap.add_argument("--gcp-key", default=os.environ.get("GCP_API_KEY", ""))
    ap.add_argument("--skip-aws", action="store_true"); ap.add_argument("--skip-gcp", action="store_true"); ap.add_argument("--skip-fx", action="store_true")
    ap.add_argument("--selftest", action="store_true")
    a = ap.parse_args()
    if a.selftest: return selftest()
    P = json.load(open(a.inp, encoding="utf-8")); total = 0
    if not a.skip_aws:
        log("== AWS Price List API")
        try:
            import boto3
            total += update_aws(P, boto3.client("pricing", region_name="us-east-1"))
        except Exception as e:
            log(f"  AWS dilewati: {e}")
    if not a.skip_gcp:
        log("== Google Cloud Billing Catalog API")
        if not a.gcp_key: log("  GCP dilewati: set --gcp-key atau env GCP_API_KEY")
        else:
            try: total += gcp_apply(P, gcp_fetch(a.gcp_key))
            except Exception as e: log(f"  GCP gagal: {e}")
    if not a.skip_fx:
        try:
            fx = fetch_fx(); log(f"== Kurs USD/IDR: {P['meta']['fx_usd_idr']} -> {fx}"); P["meta"]["fx_usd_idr"] = fx
        except Exception as e: log(f"  Kurs gagal: {e}")
    today = datetime.date.today().isoformat()
    P["meta"]["updated"] = today + " (update_prices.py)"; P["meta"]["version"] = today.replace("-", ".")
    json.dump(P, open(a.out, "w", encoding="utf-8"), indent=2, ensure_ascii=False)
    log(f"Selesai: {total} harga berubah -> {a.out}")

if __name__ == "__main__":
    main()
