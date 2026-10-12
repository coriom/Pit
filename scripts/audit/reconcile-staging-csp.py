"""Reconcile operator-observed public CSP with the identified deployment artifact."""

import base64
import hashlib
import json
import re
from html.parser import HTMLParser
from pathlib import Path


class MetaCSP(HTMLParser):
    def __init__(self):
        super().__init__()
        self.values = []

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if tag == "meta" and values.get("http-equiv", "").lower() == "content-security-policy":
            self.values.append(values.get("content", ""))


def script_hashes(policy):
    return re.findall(r"'sha256-[A-Za-z0-9+/=]+'", policy)


def config_csp(path):
    rules = json.loads(path.read_text())["headers"]
    headers = rules[0]["headers"]
    return next(item["value"] for item in headers if item["key"].lower() == "content-security-policy")


observed = Path("docs/audit/phase-y/observed-csp-y4.txt").read_text().strip()
html_path = Path("dist/tools/index.html")
html = html_path.read_text()
meta = MetaCSP()
meta.feed(html)
if len(meta.values) != 1:
    raise SystemExit("FAIL: expected one /tools/ meta CSP")
if hashlib.sha1(html.encode()).hexdigest() != "d8ff87c84165be53ee8af399621b53ad88a45d5a":
    raise SystemExit("FAIL: local /tools/ HTML differs from Vercel deployment file ID")

actual_scripts = {}
jsonld_hashes = set()
all_meta_match = True
for page in sorted(Path("dist").rglob("*.html")):
    body = page.read_text()
    page_meta = MetaCSP()
    page_meta.feed(body)
    all_meta_match &= page_meta.values == [meta.values[0]]
    for attrs, code in re.findall(r"<script\b([^>]*)>(.*?)</script\s*>", body, re.I | re.S):
        if re.search(r"\bsrc\s*=", attrs, re.I):
            continue
        digest = "'sha256-" + base64.b64encode(hashlib.sha256(code.encode()).digest()).decode() + "'"
        if re.search(r"\btype\s*=\s*['\"]application/ld\+json['\"]", attrs, re.I):
            jsonld_hashes.add(digest)
        else:
            actual_scripts.setdefault(digest, []).append(str(page.relative_to("dist")))

observed_hashes = script_hashes(observed)
actual_hashes = set(actual_scripts)
missing = sorted(actual_hashes - set(observed_hashes))
extra = sorted(set(observed_hashes) - actual_hashes)
result = {
    "deployment_html_file_id_sha1_matches": True,
    "tools_meta_present": True,
    "observed_header_equals_tools_meta_plus_frame_ancestors": observed == meta.values[0] + " frame-ancestors 'none'",
    "observed_header_equals_deployment_config_artifact": observed == config_csp(Path("dist/vercel.json")),
    "observed_header_equals_project_root_config": observed == config_csp(Path("vercel.json")),
    "all_built_pages_have_same_meta_csp": all_meta_match,
    "observed_hash_count": len(observed_hashes),
    "executable_inline_hashes": actual_scripts,
    "missing_executable_hashes": missing,
    "extra_header_hashes_without_executable_inline_script": extra,
    "jsonld_data_script_hash_count_excluded": len(jsonld_hashes),
}
print(json.dumps(result, indent=2))
if (
    not result["observed_header_equals_tools_meta_plus_frame_ancestors"]
    or not result["observed_header_equals_deployment_config_artifact"]
    or not result["observed_header_equals_project_root_config"]
    or not all_meta_match
    or len(observed_hashes) != 9
    or len(set(observed_hashes)) != 9
    or missing
):
    raise SystemExit("FAIL: deployed CSP reconciliation")
print("PASS: operator-observed /tools/ CSP matches deployment-identified HTML and local Vercel policies")
