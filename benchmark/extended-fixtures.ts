import * as Fs from "node:fs";
import * as Path from "node:path";

function write(rootDir: string, relativePath: string, content: string): void {
  const target = Path.join(rootDir, relativePath);
  Fs.mkdirSync(Path.dirname(target), { recursive: true });
  Fs.writeFileSync(target, content, "utf8");
}

function json(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function writeSkill(
  rootDir: string,
  slug: string,
  title: string,
  tags: string[],
  code: string,
): void {
  const dir = Path.join(rootDir, "benchmark", "gold-skills", slug);
  Fs.mkdirSync(dir, { recursive: true });
  write(rootDir, Path.join("benchmark", "gold-skills", slug, "SKILL.md"), [
    "---",
    "name: " + slug,
    "title: " + title,
    "tags: [" + tags.join(", ") + "]",
    "---",
    "",
    "# " + title,
    "",
    code,
  ].join("\n"));
  write(rootDir, Path.join("benchmark", "gold-skills", slug, "script.py"), code);
  write(rootDir, Path.join("benchmark", "gold-skills", slug, "meta.json"), json({
    slug,
    title,
    tags,
    version: 1,
    verified: true,
  }));
}

export function setupExtendedBenchmarkFixtures(rootDir = process.cwd()): void {
  // Existing families: second held-out task.
  write(rootDir, "benchmark/fixtures/json_extract_heldout_b/service_tree.json", json({
    services: [
      {
        name: "payments",
        instances: [
          { id: "p-1", healthy: true, endpoint: { url: "https://payments-1" } },
          { id: "p-2", healthy: false, endpoint: { url: "https://payments-2" } },
        ],
      },
      {
        name: "search",
        instances: [
          { id: "s-1", healthy: true, endpoint: { url: "https://search-1" } },
        ],
      },
    ],
  }));
  write(rootDir, "benchmark/verifiers/verify_json_extract_c.py", "import json, sys\ntry:\n    with open('healthy_services.json') as f:\n        data = json.load(f)\n    assert data == [\n        {'service': 'payments', 'instanceId': 'p-1', 'url': 'https://payments-1'},\n        {'service': 'search', 'instanceId': 's-1', 'url': 'https://search-1'},\n    ]\n    print('VERIFIER_PASS')\n    sys.exit(0)\nexcept Exception as e:\n    print(f'VERIFIER_FAIL: {e}')\n    sys.exit(1)\n");

  write(rootDir, "benchmark/fixtures/csv_cleanup_heldout_b/user_events.csv", "event_id|user|kind\nE1|alice|login\n\nE2|bob|logout\nE3|cora|login\n");
  write(rootDir, "benchmark/verifiers/verify_csv_cleanup_c.py", "import csv, sys\ntry:\n    with open('clean_events.csv', newline='') as f:\n        rows = list(csv.DictReader(f))\n    assert len(rows) == 3\n    assert rows[0] == {'event_id': 'E1', 'user': 'alice', 'kind': 'login'}\n    assert rows[2]['user'] == 'cora'\n    print('VERIFIER_PASS')\n    sys.exit(0)\nexcept Exception as e:\n    print(f'VERIFIER_FAIL: {e}')\n    sys.exit(1)\n");

  write(rootDir, "benchmark/fixtures/test_repair_heldout_b/string_tools.py", "def normalize_name(value):\n    # BUG: loses the requested title casing\n    return value.lower().strip()\n");
  write(rootDir, "benchmark/fixtures/test_repair_heldout_b/test_string_tools.py", "import unittest\nfrom string_tools import normalize_name\n\nclass TestStringTools(unittest.TestCase):\n    def test_normalize_name(self):\n        self.assertEqual(normalize_name('  ada lovelace '), 'Ada Lovelace')\n        self.assertEqual(normalize_name('grace hopper'), 'Grace Hopper')\n\nif __name__ == '__main__':\n    unittest.main()\n");
  write(rootDir, "benchmark/verifiers/verify_test_repair_c.py", "import subprocess, sys\nres = subprocess.run(['python3', '-m', 'unittest', 'test_string_tools.py'], capture_output=True, text=True)\nif res.returncode == 0 and 'OK' in res.stderr:\n    print('VERIFIER_PASS')\n    sys.exit(0)\nprint(f'VERIFIER_FAIL: {res.stderr}')\nsys.exit(1)\n");

  write(rootDir, "benchmark/fixtures/log_diagnosis_heldout_b/worker.log", "2026-08-24 11:00:00 ERROR ValueError: invalid payload\n2026-08-24 11:01:00 ERROR ConnectionError: upstream unavailable\n2026-08-24 11:02:00 ERROR ValueError: invalid timestamp\n2026-08-24 11:03:00 INFO worker recovered\n");
  write(rootDir, "benchmark/verifiers/verify_log_diagnosis_c.py", "import json, sys\ntry:\n    with open('worker_errors.json') as f:\n        data = json.load(f)\n    assert data.get('ValueError') == 2\n    assert data.get('ConnectionError') == 1\n    print('VERIFIER_PASS')\n    sys.exit(0)\nexcept Exception as e:\n    print(f'VERIFIER_FAIL: {e}')\n    sys.exit(1)\n");

  // Repetitive transformation: XML extraction.
  write(rootDir, "benchmark/fixtures/xml_extract_train/catalog.xml", "<?xml version=\"1.0\"?>\n<catalog>\n  <product sku=\"A-1\" active=\"true\"><name>Keyboard</name><price>49.50</price></product>\n  <product sku=\"A-2\" active=\"false\"><name>Mouse</name><price>19.00</price></product>\n  <product sku=\"A-3\" active=\"true\"><name>Monitor</name><price>199.00</price></product>\n</catalog>\n");
  write(rootDir, "benchmark/fixtures/xml_extract_heldout_a/inventory.xml", "<?xml version=\"1.0\"?>\n<inventory>\n  <item id=\"I-10\" status=\"in_stock\"><label>Dock</label><warehouse>east</warehouse></item>\n  <item id=\"I-11\" status=\"backorder\"><label>Stand</label><warehouse>west</warehouse></item>\n  <item id=\"I-12\" status=\"in_stock\"><label>Hub</label><warehouse>east</warehouse></item>\n</inventory>\n");
  write(rootDir, "benchmark/fixtures/xml_extract_heldout_b/library.xml", "<?xml version=\"1.0\"?>\n<library>\n  <book isbn=\"978-1\" available=\"true\"><title>Patterns</title><author>Gamma</author></book>\n  <book isbn=\"978-2\" available=\"false\"><title>Compilers</title><author>Aho</author></book>\n  <book isbn=\"978-3\" available=\"true\"><title>Networks</title><author>Tanenbaum</author></book>\n</library>\n");
  write(rootDir, "benchmark/verifiers/verify_xml_extract.py", "import json, sys\ntry:\n    with open('products.json') as f:\n        data = json.load(f)\n    assert data == [\n        {'sku': 'A-1', 'name': 'Keyboard', 'price': 49.5},\n        {'sku': 'A-3', 'name': 'Monitor', 'price': 199.0},\n    ]\n    print('VERIFIER_PASS')\n    sys.exit(0)\nexcept Exception as e:\n    print(f'VERIFIER_FAIL: {e}')\n    sys.exit(1)\n");
  write(rootDir, "benchmark/verifiers/verify_xml_extract_b.py", "import json, sys\ntry:\n    with open('available_inventory.json') as f:\n        data = json.load(f)\n    assert data == [\n        {'id': 'I-10', 'label': 'Dock', 'warehouse': 'east'},\n        {'id': 'I-12', 'label': 'Hub', 'warehouse': 'east'},\n    ]\n    print('VERIFIER_PASS')\n    sys.exit(0)\nexcept Exception as e:\n    print(f'VERIFIER_FAIL: {e}')\n    sys.exit(1)\n");
  write(rootDir, "benchmark/verifiers/verify_xml_extract_c.py", "import json, sys\ntry:\n    with open('available_books.json') as f:\n        data = json.load(f)\n    assert data == [\n        {'isbn': '978-1', 'title': 'Patterns', 'author': 'Gamma'},\n        {'isbn': '978-3', 'title': 'Networks', 'author': 'Tanenbaum'},\n    ]\n    print('VERIFIER_PASS')\n    sys.exit(0)\nexcept Exception as e:\n    print(f'VERIFIER_FAIL: {e}')\n    sys.exit(1)\n");

  // Repetitive transformation: INI normalization.
  write(rootDir, "benchmark/fixtures/ini_normalize_train/raw.ini", "[server]\nhost = api.internal\nport = 8080\n[feature]\ncache = true\nregion = us-east\n");
  write(rootDir, "benchmark/fixtures/ini_normalize_heldout_a/staging.ini", "[server]\nhost = staging.internal\nport = 8081\n[feature]\ncache = false\nregion = eu-west\n");
  write(rootDir, "benchmark/fixtures/ini_normalize_heldout_b/client.ini", "[client]\nname = desktop\nversion = 4\n[flags]\ntelemetry = false\nbeta = true\n");
  write(rootDir, "benchmark/verifiers/verify_ini_normalize.py", "import json, sys\ntry:\n    with open('normalized.json') as f:\n        data = json.load(f)\n    assert data == {'server': {'host': 'api.internal', 'port': '8080'}, 'feature': {'cache': 'true', 'region': 'us-east'}}\n    print('VERIFIER_PASS')\n    sys.exit(0)\nexcept Exception as e:\n    print(f'VERIFIER_FAIL: {e}')\n    sys.exit(1)\n");
  write(rootDir, "benchmark/verifiers/verify_ini_normalize_b.py", "import json, sys\ntry:\n    with open('staging_config.json') as f:\n        data = json.load(f)\n    assert data == {'server': {'host': 'staging.internal', 'port': '8081'}, 'feature': {'cache': 'false', 'region': 'eu-west'}}\n    print('VERIFIER_PASS')\n    sys.exit(0)\nexcept Exception as e:\n    print(f'VERIFIER_FAIL: {e}')\n    sys.exit(1)\n");
  write(rootDir, "benchmark/verifiers/verify_ini_normalize_c.py", "import json, sys\ntry:\n    with open('client_config.json') as f:\n        data = json.load(f)\n    assert data == {'client': {'name': 'desktop', 'version': '4'}, 'flags': {'telemetry': 'false', 'beta': 'true'}}\n    print('VERIFIER_PASS')\n    sys.exit(0)\nexcept Exception as e:\n    print(f'VERIFIER_FAIL: {e}')\n    sys.exit(1)\n");

  // Diagnostic workflow: configuration audit.
  write(rootDir, "benchmark/fixtures/config_diagnosis_train/app_config.json", json({
    environment: "production",
    debug: true,
    database: { ssl: false, password: "plaintext" },
  }));
  write(rootDir, "benchmark/fixtures/config_diagnosis_heldout_a/service_config.json", json({
    environment: "prod",
    auth: { allow_anonymous: true },
    tls: { enabled: false },
    retries: 0,
  }));
  write(rootDir, "benchmark/fixtures/config_diagnosis_heldout_b/deployment.json", json({
    replicas: 0,
    image: "api:latest",
    security: { privileged: true },
  }));
  write(rootDir, "benchmark/verifiers/verify_config_diagnosis.py", "import json, sys\ntry:\n    with open('config_issues.json') as f:\n        data = json.load(f)\n    assert data == ['debug_enabled', 'database_ssl_disabled', 'plaintext_password']\n    print('VERIFIER_PASS')\n    sys.exit(0)\nexcept Exception as e:\n    print(f'VERIFIER_FAIL: {e}')\n    sys.exit(1)\n");
  write(rootDir, "benchmark/verifiers/verify_config_diagnosis_b.py", "import json, sys\ntry:\n    with open('service_issues.json') as f:\n        data = json.load(f)\n    assert data == ['anonymous_access', 'tls_disabled', 'retries_disabled']\n    print('VERIFIER_PASS')\n    sys.exit(0)\nexcept Exception as e:\n    print(f'VERIFIER_FAIL: {e}')\n    sys.exit(1)\n");
  write(rootDir, "benchmark/verifiers/verify_config_diagnosis_c.py", "import json, sys\ntry:\n    with open('deployment_issues.json') as f:\n        data = json.load(f)\n    assert data == ['zero_replicas', 'floating_image_tag', 'privileged_container']\n    print('VERIFIER_PASS')\n    sys.exit(0)\nexcept Exception as e:\n    print(f'VERIFIER_FAIL: {e}')\n    sys.exit(1)\n");

  // Diagnostic workflow: traceback extraction.
  write(rootDir, "benchmark/fixtures/traceback_diagnosis_train/traceback.txt", "Traceback (most recent call last):\n  File \"parser.py\", line 27, in parse_record\n    return record['id']\nTypeError: 'NoneType' object is not subscriptable\n");
  write(rootDir, "benchmark/fixtures/traceback_diagnosis_heldout_a/job_trace.txt", "Traceback (most recent call last):\n  File \"loader.py\", line 18, in load_job\n    return open(path).read()\nFileNotFoundError: [Errno 2] No such file or directory\n");
  write(rootDir, "benchmark/fixtures/traceback_diagnosis_heldout_b/api_trace.txt", "Traceback (most recent call last):\n  File \"client.py\", line 73, in fetch\n    return payload['token']\nKeyError: 'token'\n");
  write(rootDir, "benchmark/verifiers/verify_traceback_diagnosis.py", "import json, sys\ntry:\n    with open('root_cause.json') as f:\n        data = json.load(f)\n    assert data == {'error': 'TypeError', 'file': 'parser.py', 'line': 27}\n    print('VERIFIER_PASS')\n    sys.exit(0)\nexcept Exception as e:\n    print(f'VERIFIER_FAIL: {e}')\n    sys.exit(1)\n");
  write(rootDir, "benchmark/verifiers/verify_traceback_diagnosis_b.py", "import json, sys\ntry:\n    with open('job_root_cause.json') as f:\n        data = json.load(f)\n    assert data == {'error': 'FileNotFoundError', 'file': 'loader.py', 'line': 18}\n    print('VERIFIER_PASS')\n    sys.exit(0)\nexcept Exception as e:\n    print(f'VERIFIER_FAIL: {e}')\n    sys.exit(1)\n");
  write(rootDir, "benchmark/verifiers/verify_traceback_diagnosis_c.py", "import json, sys\ntry:\n    with open('api_root_cause.json') as f:\n        data = json.load(f)\n    assert data == {'error': 'KeyError', 'file': 'client.py', 'line': 73}\n    print('VERIFIER_PASS')\n    sys.exit(0)\nexcept Exception as e:\n    print(f'VERIFIER_FAIL: {e}')\n    sys.exit(1)\n");

  // Diagnostic workflow: metrics anomaly scan.
  write(rootDir, "benchmark/fixtures/metrics_diagnosis_train/metrics.csv", "service,error_rate,latency_ms\napi,1.2,120\nworker,8.5,210\nsearch,2.0,750\n");
  write(rootDir, "benchmark/fixtures/metrics_diagnosis_heldout_a/metrics_a.csv", "service,error_rate,latency_ms\ncheckout,0.4,610\ncatalog,6.1,180\nlogin,1.0,90\n");
  write(rootDir, "benchmark/fixtures/metrics_diagnosis_heldout_b/metrics_b.csv", "service,error_rate,latency_ms\nbilling,7.0,700\nprofile,1.0,300\nqueue,4.5,100\n");
  write(rootDir, "benchmark/verifiers/verify_metrics_diagnosis.py", "import json, sys\ntry:\n    with open('anomalies.json') as f:\n        data = json.load(f)\n    assert data == ['worker', 'search']\n    print('VERIFIER_PASS')\n    sys.exit(0)\nexcept Exception as e:\n    print(f'VERIFIER_FAIL: {e}')\n    sys.exit(1)\n");
  write(rootDir, "benchmark/verifiers/verify_metrics_diagnosis_b.py", "import json, sys\ntry:\n    with open('metric_anomalies.json') as f:\n        data = json.load(f)\n    assert data == ['checkout', 'catalog']\n    print('VERIFIER_PASS')\n    sys.exit(0)\nexcept Exception as e:\n    print(f'VERIFIER_FAIL: {e}')\n    sys.exit(1)\n");
  write(rootDir, "benchmark/verifiers/verify_metrics_diagnosis_c.py", "import json, sys\ntry:\n    with open('metric_anomalies.json') as f:\n        data = json.load(f)\n    assert data == ['billing']\n    print('VERIFIER_PASS')\n    sys.exit(0)\nexcept Exception as e:\n    print(f'VERIFIER_FAIL: {e}')\n    sys.exit(1)\n");

  // Repository modification: API migration.
  write(rootDir, "benchmark/fixtures/api_migration_train/legacy_client.py", "def get_user(api, user_id):\n    return api.get_user(user_id)\n");
  write(rootDir, "benchmark/fixtures/api_migration_train/test_legacy_client.py", "import unittest\nfrom legacy_client import get_user\n\nclass NewApi:\n    def fetch_user(self, user_id):\n        return {'id': user_id, 'name': 'Ada'}\n\nclass TestClient(unittest.TestCase):\n    def test_migrates_to_new_api(self):\n        self.assertEqual(get_user(NewApi(), 7)['name'], 'Ada')\n\nif __name__ == '__main__':\n    unittest.main()\n");
  write(rootDir, "benchmark/fixtures/api_migration_heldout_a/billing_client.py", "def get_invoice(api, invoice_id):\n    return api.get_invoice(invoice_id)\n");
  write(rootDir, "benchmark/fixtures/api_migration_heldout_a/test_billing_client.py", "import unittest\nfrom billing_client import get_invoice\n\nclass NewBillingApi:\n    def fetch_invoice(self, invoice_id):\n        return {'id': invoice_id, 'total': 42}\n\nclass TestBillingClient(unittest.TestCase):\n    def test_migrates_to_new_api(self):\n        self.assertEqual(get_invoice(NewBillingApi(), 'i-1')['total'], 42)\n\nif __name__ == '__main__':\n    unittest.main()\n");
  write(rootDir, "benchmark/fixtures/api_migration_heldout_b/profile_client.py", "def get_profile(api, user_id):\n    return api.get_profile(user_id)\n");
  write(rootDir, "benchmark/fixtures/api_migration_heldout_b/test_profile_client.py", "import unittest\nfrom profile_client import get_profile\n\nclass NewProfileApi:\n    def fetch_profile(self, user_id):\n        return {'id': user_id, 'plan': 'pro'}\n\nclass TestProfileClient(unittest.TestCase):\n    def test_migrates_to_new_api(self):\n        self.assertEqual(get_profile(NewProfileApi(), 'u-2')['plan'], 'pro')\n\nif __name__ == '__main__':\n    unittest.main()\n");
  write(rootDir, "benchmark/verifiers/verify_api_migration.py", "import subprocess, sys\nres = subprocess.run(['python3', '-m', 'unittest', 'test_legacy_client.py'], capture_output=True, text=True)\nif res.returncode == 0 and 'OK' in res.stderr:\n    print('VERIFIER_PASS')\n    sys.exit(0)\nprint(f'VERIFIER_FAIL: {res.stderr}')\nsys.exit(1)\n");
  write(rootDir, "benchmark/verifiers/verify_api_migration_b.py", "import subprocess, sys\nres = subprocess.run(['python3', '-m', 'unittest', 'test_billing_client.py'], capture_output=True, text=True)\nif res.returncode == 0 and 'OK' in res.stderr:\n    print('VERIFIER_PASS')\n    sys.exit(0)\nprint(f'VERIFIER_FAIL: {res.stderr}')\nsys.exit(1)\n");
  write(rootDir, "benchmark/verifiers/verify_api_migration_c.py", "import subprocess, sys\nres = subprocess.run(['python3', '-m', 'unittest', 'test_profile_client.py'], capture_output=True, text=True)\nif res.returncode == 0 and 'OK' in res.stderr:\n    print('VERIFIER_PASS')\n    sys.exit(0)\nprint(f'VERIFIER_FAIL: {res.stderr}')\nsys.exit(1)\n");

  // Repository modification: symbol rename with caller updates.
  write(rootDir, "benchmark/fixtures/refactor_rename_train/reporter.py", "def build_report(rows):\n    return {'count': len(rows), 'total': sum(rows)}\n\ndef main(rows):\n    return build_report(rows)\n");
  write(rootDir, "benchmark/fixtures/refactor_rename_train/test_reporter.py", "import unittest\nfrom reporter import make_report\n\nclass TestReporter(unittest.TestCase):\n    def test_make_report(self):\n        self.assertEqual(make_report([2, 3]), {'count': 2, 'total': 5})\n\nif __name__ == '__main__':\n    unittest.main()\n");
  write(rootDir, "benchmark/fixtures/refactor_rename_heldout_a/formatter.py", "def format_user(user):\n    return user['name'].strip()\n\ndef render_page(user):\n    return format_user(user)\n");
  write(rootDir, "benchmark/fixtures/refactor_rename_heldout_a/test_formatter.py", "import unittest\nfrom formatter import render_user\n\nclass TestFormatter(unittest.TestCase):\n    def test_render_user(self):\n        self.assertEqual(render_user({'name': ' Ada '}), 'Ada')\n\nif __name__ == '__main__':\n    unittest.main()\n");
  write(rootDir, "benchmark/fixtures/refactor_rename_heldout_b/stats.py", "def calc_total(values):\n    return sum(values)\n\ndef summarize(values):\n    return calc_total(values)\n");
  write(rootDir, "benchmark/fixtures/refactor_rename_heldout_b/test_stats.py", "import unittest\nfrom stats import sum_total\n\nclass TestStats(unittest.TestCase):\n    def test_sum_total(self):\n        self.assertEqual(sum_total([4, 5, 6]), 15)\n\nif __name__ == '__main__':\n    unittest.main()\n");
  write(rootDir, "benchmark/verifiers/verify_refactor_rename.py", "import subprocess, sys\nres = subprocess.run(['python3', '-m', 'unittest', 'test_reporter.py'], capture_output=True, text=True)\nif res.returncode == 0 and 'OK' in res.stderr:\n    print('VERIFIER_PASS')\n    sys.exit(0)\nprint(f'VERIFIER_FAIL: {res.stderr}')\nsys.exit(1)\n");
  write(rootDir, "benchmark/verifiers/verify_refactor_rename_b.py", "import subprocess, sys\nres = subprocess.run(['python3', '-m', 'unittest', 'test_formatter.py'], capture_output=True, text=True)\nif res.returncode == 0 and 'OK' in res.stderr:\n    print('VERIFIER_PASS')\n    sys.exit(0)\nprint(f'VERIFIER_FAIL: {res.stderr}')\nsys.exit(1)\n");
  write(rootDir, "benchmark/verifiers/verify_refactor_rename_c.py", "import subprocess, sys\nres = subprocess.run(['python3', '-m', 'unittest', 'test_stats.py'], capture_output=True, text=True)\nif res.returncode == 0 and 'OK' in res.stderr:\n    print('VERIFIER_PASS')\n    sys.exit(0)\nprint(f'VERIFIER_FAIL: {res.stderr}')\nsys.exit(1)\n");

  // One-off reasoning: release-note synthesis.
  write(rootDir, "benchmark/fixtures/release_notes_train/changes.txt", "Added CSV export for reports\nFixed login timeout on slow networks\n");
  write(rootDir, "benchmark/fixtures/release_notes_heldout_a/changes.txt", "Added dark mode to the dashboard\nFixed duplicate email notifications\n");
  write(rootDir, "benchmark/fixtures/release_notes_heldout_b/changes.txt", "Added webhook retry controls\nFixed stale cache after logout\n");
  write(rootDir, "benchmark/verifiers/verify_release_notes.py", "import sys\ntry:\n    text = open('release_notes.md').read()\n    assert '## Highlights' in text\n    assert '- Added CSV export for reports' in text\n    assert '- Fixed login timeout on slow networks' in text\n    print('VERIFIER_PASS')\n    sys.exit(0)\nexcept Exception as e:\n    print(f'VERIFIER_FAIL: {e}')\n    sys.exit(1)\n");
  write(rootDir, "benchmark/verifiers/verify_release_notes_b.py", "import sys\ntry:\n    text = open('release_notes.md').read()\n    assert '## Highlights' in text\n    assert '- Added dark mode to the dashboard' in text\n    assert '- Fixed duplicate email notifications' in text\n    print('VERIFIER_PASS')\n    sys.exit(0)\nexcept Exception as e:\n    print(f'VERIFIER_FAIL: {e}')\n    sys.exit(1)\n");
  write(rootDir, "benchmark/verifiers/verify_release_notes_c.py", "import sys\ntry:\n    text = open('release_notes.md').read()\n    assert '## Highlights' in text\n    assert '- Added webhook retry controls' in text\n    assert '- Fixed stale cache after logout' in text\n    print('VERIFIER_PASS')\n    sys.exit(0)\nexcept Exception as e:\n    print(f'VERIFIER_FAIL: {e}')\n    sys.exit(1)\n");

  const skills = [
    ["gold-xml-extractor", "XML Inventory Extractor", ["xml", "extract", "inventory", "catalog"], [
      "import json",
      "import xml.etree.ElementTree as ET",
      "",
      "def extract_active_items(input_path, output_path):",
      "    root = ET.parse(input_path).getroot()",
      "    items = []",
      "    for node in root:",
      "        active = node.get('active') == 'true' or node.get('status') == 'in_stock' or node.get('available') == 'true'",
      "        if active:",
      "            item = dict(node.attrib)",
      "            item.update({child.tag: child.text for child in node})",
      "            items.append(item)",
      "    with open(output_path, 'w') as f:",
      "        json.dump(items, f, indent=2)",
      "    return items",
    ].join("\n")],
    ["gold-ini-normalizer", "INI Section Normalizer", ["ini", "config", "normalize", "sections"], [
      "import configparser",
      "import json",
      "",
      "def normalize_ini(input_path, output_path):",
      "    parser = configparser.ConfigParser()",
      "    parser.read(input_path)",
      "    data = {section: dict(parser[section]) for section in parser.sections()}",
      "    with open(output_path, 'w') as f:",
      "        json.dump(data, f, indent=2)",
      "    return data",
    ].join("\n")],
    ["gold-config-auditor", "JSON Configuration Risk Auditor", ["config", "audit", "security", "diagnosis"], [
      "import json",
      "",
      "def audit_config(input_path, output_path):",
      "    with open(input_path) as f:",
      "        config = json.load(f)",
      "    issues = []",
      "    if config.get('debug') is True: issues.append('debug_enabled')",
      "    if config.get('database', {}).get('ssl') is False: issues.append('database_ssl_disabled')",
      "    if config.get('database', {}).get('password') == 'plaintext': issues.append('plaintext_password')",
      "    with open(output_path, 'w') as f:",
      "        json.dump(issues, f, indent=2)",
      "    return issues",
    ].join("\n")],
    ["gold-traceback-diagnoser", "Python Traceback Root-Cause Extractor", ["traceback", "diagnosis", "error", "line"], [
      "import json",
      "import re",
      "",
      "def extract_root_cause(input_path, output_path):",
      "    text = open(input_path).read()",
      "    file_name = re.findall(r'File \"([^\"]+)\", line (\\d+)', text)[-1]",
      "    error = re.findall(r'^([A-Za-z_]+Error):', text, re.MULTILINE)[-1]",
      "    result = {'error': error, 'file': file_name[0], 'line': int(file_name[1])}",
      "    json.dump(result, open(output_path, 'w'), indent=2)",
      "    return result",
    ].join("\n")],
    ["gold-metrics-analyzer", "CSV Metrics Anomaly Scanner", ["metrics", "csv", "anomaly", "diagnosis"], [
      "import csv",
      "import json",
      "",
      "def find_anomalies(input_path, output_path):",
      "    with open(input_path, newline='') as f:",
      "        rows = list(csv.DictReader(f))",
      "    result = [row['service'] for row in rows if float(row['error_rate']) > 5 or float(row['latency_ms']) > 500]",
      "    json.dump(result, open(output_path, 'w'), indent=2)",
      "    return result",
    ].join("\n")],
    ["gold-api-migrator", "Client API Method Migration", ["api", "migration", "client", "refactor"], [
      "def migrate_call(api, resource, value):",
      "    return getattr(api, 'fetch_' + resource)(value)",
    ].join("\n")],
    ["gold-symbol-renamer", "Python Symbol Rename and Caller Update", ["refactor", "rename", "symbol", "caller"], [
      "def rename_symbol(source, old_name, new_name):",
      "    return source.replace(old_name, new_name)",
    ].join("\n")],
    ["gold-release-notes", "Release Notes From Change List", ["release", "notes", "summary", "one-off"], [
      "def build_release_notes(changes):",
      "    lines = ['## Highlights', '']",
      "    lines.extend('- ' + line for line in changes if line.strip())",
      "    return '\\n'.join(lines) + '\\n'",
    ].join("\n")],
  ] as const;

  for (const [slug, title, tags, code] of skills) {
    writeSkill(rootDir, slug, title, [...tags], code);
  }
}
