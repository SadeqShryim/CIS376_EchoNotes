import uuid

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def unique_email():
    return f"test_{uuid.uuid4().hex[:8]}@echonotes-test.com"


def test_signup_returns_token():
    email = unique_email()
    r = client.post("/auth/signup", json={"email": email, "password": "TestPass123!"})
    assert r.status_code == 200
    data = r.json()
    assert "user_id" in data
    assert "access_token" in data
    assert data["access_token"] is not None


def test_login_returns_token():
    email = unique_email()
    # Signup first
    client.post("/auth/signup", json={"email": email, "password": "TestPass123!"})
    # Login
    r = client.post("/auth/login", json={"email": email, "password": "TestPass123!"})
    assert r.status_code == 200
    data = r.json()
    assert "user_id" in data
    assert "access_token" in data


def test_duplicate_signup_fails():
    email = unique_email()
    r1 = client.post("/auth/signup", json={"email": email, "password": "TestPass123!"})
    assert r1.status_code == 200
    r2 = client.post("/auth/signup", json={"email": email, "password": "TestPass123!"})
    assert r2.status_code == 409


def test_invalid_credentials_return_401():
    r = client.post("/auth/login", json={"email": "nobody@echonotes-test.com", "password": "WrongPass!"})
    assert r.status_code == 401


def test_logout():
    email = unique_email()
    signup = client.post("/auth/signup", json={"email": email, "password": "TestPass123!"})
    token = signup.json()["access_token"]
    r = client.post("/auth/logout", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    assert r.json() == {"ok": True}
