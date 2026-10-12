from tests.conftest import ConsoleProvider, last_mail_link, register_and_login


async def test_register_verify_login_refresh_logout(client):
    r = await client.post("/api/auth/register", json={"email": "a@b.test", "password": "Moin-Hafen-2026!", "full_name": "A", "company": "Müller Sanitär GmbH", "trade": "shk", "accept_terms": True, "accept_privacy": True})
    assert r.status_code == 201
    assert any("bestaetigen" in m["text"] for m in ConsoleProvider.sent)
    # Login vor Bestätigung ist möglich, Tenant-Endpunkte aber gesperrt
    r = await client.post("/api/auth/login", json={"email": "a@b.test", "password": "Moin-Hafen-2026!"})
    assert r.status_code == 200
    h = {"Authorization": f"Bearer {r.json()['access_token']}"}
    assert (await client.get("/api/tenant", headers=h)).status_code == 403
    r = await client.post("/api/auth/verify-email", json={"token": last_mail_link("/bestaetigen")})
    assert r.status_code == 200 and r.json()["user"]["email_verified"] is True
    # Token zweimal benutzen schlägt fehl
    assert (await client.post("/api/auth/verify-email", json={"token": last_mail_link("/bestaetigen")})).status_code == 400
    r = await client.post("/api/auth/login", json={"email": "a@b.test", "password": "Moin-Hafen-2026!"})
    assert "wp_refresh" in r.cookies
    me = await client.get("/api/auth/me", headers={"Authorization": f"Bearer {r.json()['access_token']}"})
    assert me.json()["tenants"][0]["role"] == "owner"
    assert me.json()["tenants"][0]["slug"] == "mueller-sanitaer-gmbh"
    r2 = await client.post("/api/auth/refresh")
    assert r2.status_code == 200 and r2.json()["access_token"]
    old_refresh = r.cookies.get("wp_refresh")
    # Altes Refresh-Token ist nach Rotation ungültig
    client.cookies.clear()
    client.cookies.set("wp_refresh", old_refresh)
    assert (await client.post("/api/auth/refresh")).status_code == 401
    assert (await client.post("/api/auth/logout")).status_code == 200


async def test_weak_password_and_duplicate(client):
    base = {"full_name": "A", "company": "X GmbH", "trade": "maler", "accept_terms": True, "accept_privacy": True}
    assert (await client.post("/api/auth/register", json={**base, "email": "x@y.test", "password": "passwort123"})).status_code == 422
    assert (await client.post("/api/auth/register", json={**base, "email": "x@y.test", "password": "Kran-Elbe-Fisch-42"})).status_code == 201
    assert (await client.post("/api/auth/register", json={**base, "email": "X@Y.test", "password": "Kran-Elbe-Fisch-42"})).status_code == 409
    assert (await client.post("/api/auth/register", json={**base, "email": "z@y.test", "password": "Kran-Elbe-Fisch-42", "accept_terms": False})).status_code == 422


async def test_wrong_password_and_lockout(client):
    await register_and_login(client)
    for _ in range(8):
        r = await client.post("/api/auth/login", json={"email": "chef@beispiel-elektro.test", "password": "falsch-falsch-1"})
        assert r.status_code == 401
    r = await client.post("/api/auth/login", json={"email": "chef@beispiel-elektro.test", "password": "Moin-Hafen-2026!"})
    assert r.status_code == 423
    assert (await client.post("/api/auth/login", json={"email": "niemand@x.test", "password": "irgendwas-123"})).status_code == 401


async def test_password_reset_flow(client):
    await register_and_login(client)
    r = await client.post("/api/auth/password/forgot", json={"email": "chef@beispiel-elektro.test"})
    assert r.status_code == 200
    token = last_mail_link("/passwort-neu")
    assert (await client.post("/api/auth/password/reset", json={"token": token, "password": "Deich-Wetter-Sieben7"})).status_code == 200
    assert (await client.post("/api/auth/login", json={"email": "chef@beispiel-elektro.test", "password": "Moin-Hafen-2026!"})).status_code == 401
    assert (await client.post("/api/auth/login", json={"email": "chef@beispiel-elektro.test", "password": "Deich-Wetter-Sieben7"})).status_code == 200
    # unbekannte Adresse gibt keine Auskunft
    assert (await client.post("/api/auth/password/forgot", json={"email": "unbekannt@x.test"})).status_code == 200


async def test_invalid_token_rejected(client):
    assert (await client.get("/api/auth/me", headers={"Authorization": "Bearer abc.def.ghi"})).status_code == 401
    assert (await client.get("/api/auth/me")).status_code == 401
