import os
from pathlib import Path
import shutil
import subprocess

from fastapi.testclient import TestClient
import pytest

os.environ.setdefault('DATABASE_URL', '')

from backend.app.database import Base, ReviewReportRecord
from backend.app.main import app
from backend.app.product_repository import ProductRepository
from backend.app import storage
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker


def test_legacy_saved_review_keeps_report_without_inventing_sales_totals():
    engine = create_engine('sqlite+pysqlite:///:memory:')
    Base.metadata.create_all(engine)
    sessions = sessionmaker(bind=engine)
    legacy = {
        'highFrequencyQuestions': ['legacy question'],
        'emotionSummary': {'感兴趣': 1, '犹豫': 0, '质疑': 0, '投诉': 0},
        'blockers': ['legacy blocker'],
        'suggestions': ['legacy suggestion'],
        'nextProductOrder': ['legacy product'],
    }
    with sessions() as session:
        session.add(ReviewReportRecord(report=legacy))
        session.commit()

    loaded = ProductRepository(sessions).latest_review_report()

    assert loaded.highFrequencyQuestions == legacy['highFrequencyQuestions']
    assert loaded.salesSummary is None


def test_review_sales_totals_include_orders_beyond_the_recent_feed(monkeypatch):
    monkeypatch.setattr(storage, '_repository', None)
    monkeypatch.setattr(storage, '_orders', [])
    monkeypatch.setattr(storage, '_latest_review', None)
    client = TestClient(app)
    product = client.get('/api/products/').json()['items'][0]
    for _ in range(61):
        response = client.post('/api/orders/', json={
            'profile': '学生党',
            'items': [{'productId': product['id'], 'quantity': 2}],
        })
        assert response.status_code == 200

    report = client.post('/api/review/generate/', json={'qaLogs': []})

    assert report.status_code == 200
    summary = report.json()['salesSummary']
    assert summary['totalOrders'] == 61
    assert summary['totalQuantity'] == 122
    assert summary['totalAmount'] == 122 * product['livePrice']
    assert summary['productSales'][0]['quantity'] == 122
    assert len(client.get('/api/orders/').json()['items']) == 50


@pytest.mark.parametrize('response,expected', [
    ("return @{status='ok'}", 'true'),
    ("return @{status='unrelated'}", 'false'),
    ("throw 'unavailable'", 'false'),
])
def test_powershell_startup_health_check_accepts_only_healthy_backend(response, expected):
    ps = shutil.which('pwsh') or shutil.which('powershell')
    if not ps and os.name == 'nt':
        candidate = Path(os.environ.get('SystemRoot', 'C:/Windows')) / 'System32/WindowsPowerShell/v1.0/powershell.exe'
        ps = str(candidate) if candidate.exists() else None
    if not ps:
        pytest.skip('PowerShell is not available')
    script = (Path(__file__).resolve().parents[2] / 'start-project.ps1').as_posix().replace("'", "''")
    command = (
        "$ErrorActionPreference='Stop'; $tokens=$null; $errors=$null; "
        f"$ast=[System.Management.Automation.Language.Parser]::ParseFile('{script}',[ref]$tokens,[ref]$errors); "
        "$definition=$ast.Find({param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Test-BackendHealth'},$true); "
        "if ($null -eq $definition) { throw 'Backend health check function is missing' }; "
        "Invoke-Expression $definition.Extent.Text; "
        f"function Invoke-RestMethod {{ {response} }}; "
        "(Test-BackendHealth).ToString().ToLowerInvariant()"
    )
    result = subprocess.run([ps, '-NoProfile', '-NonInteractive', '-Command', command], capture_output=True, text=True, timeout=15)
    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == expected
