from tests.conftest import activate_plan, last_mail_link, make_operator, register_and_login


async def test_tenant_isolation(client):
    h1, t1 = await register_and_login(client, email="a@one.test", company="Eins GmbH")
    h2, t2 = await register_and_login(client, email="b@two.test", company="Zwei GmbH")
    r = await client.post(
        "/api/inquiries",
        headers=h1,
        json={"subject": "Heizung", "body": "Die Heizung ist ausgefallen, bitte dringend kommen. Musterstraße 1, 20095 Hamburg, Tel 040 123456"},
    )
    assert r.status_code == 201
    inq_id = r.json()["id"]
    assert (await client.get(f"/api/inquiries/{inq_id}", headers=h2)).status_code == 404
    assert (await client.get("/api/inquiries", headers=h2)).json()["total"] == 0
    # Tenant-Header-Spoofing: Nutzer 2 versucht Betrieb 1
    assert (await client.get("/api/inquiries", headers={**h2, "X-Tenant-Id": t1})).status_code == 403
    assert (await client.get("/api/tenant/dashboard", headers={**h2, "X-Tenant-Id": t1})).status_code == 403


async def test_roles_member_vs_admin(client, db):
    h_owner, tid = await register_and_login(client, email="owner@x.test", company="Rollen GmbH")
    await activate_plan(db, tid, "business")
    r = await client.post("/api/tenant/members/invite", headers=h_owner, json={"email": "mitarbeiter@x.test", "role": "member"})
    assert r.status_code == 201
    inv_token = last_mail_link("/einladung")
    h_member, _ = await register_and_login(client, email="mitarbeiter@x.test", company="Eigene Firma")
    r = await client.post("/api/auth/invitations/accept", headers=h_member, json={"token": inv_token})
    assert r.status_code == 200 and r.json()["tenant_id"] == tid
    r = await client.post("/api/auth/switch-tenant", headers=h_member, json={"tenant_id": tid})
    h_member_t = {"Authorization": f"Bearer {r.json()['access_token']}"}
    assert (await client.get("/api/inquiries", headers=h_member_t)).status_code == 200
    assert (await client.patch("/api/tenant", headers=h_member_t, json={"name": "Hack"})).status_code == 403
    assert (await client.post("/api/tenant/members/invite", headers=h_member_t, json={"email": "c@x.test", "role": "member"})).status_code == 403
    assert (await client.get("/api/tenant/export", headers=h_member_t)).status_code == 403
    assert (await client.post("/api/billing/checkout", headers=h_member_t, json={"plan": "starter"})).status_code == 403
    # Owner kann letzte Owner-Rolle nicht abgeben
    me = (await client.get("/api/auth/me", headers=h_owner)).json()
    assert (await client.patch(f"/api/tenant/members/{me['user']['id']}", headers=h_owner, json={"role": "member"})).status_code == 400
    # Owner entfernt Mitglied
    members = (await client.get("/api/tenant/members", headers=h_owner)).json()
    mid = next(m["user_id"] for m in members if m["role"] == "member")
    assert (await client.delete(f"/api/tenant/members/{mid}", headers=h_owner)).status_code == 200
    assert (await client.get("/api/inquiries", headers=h_member_t)).status_code == 403


async def test_operator_only_admin(client, db):
    h, _ = await register_and_login(client, email="kunde@x.test", company="Kunde GmbH")
    assert (await client.get("/api/admin/overview", headers=h)).status_code == 403
    assert (await client.post("/api/admin/kill-switch", headers=h, json={"active": True})).status_code == 403
    await make_operator(db, "kunde@x.test")
    assert (await client.get("/api/admin/overview", headers=h)).status_code == 200
    assert (await client.post("/api/admin/kill-switch", headers=h, json={"active": True, "reason": "test"})).json()["active"] is True
    assert (await client.get("/health")).json()["kill_switch"] is True
    assert (await client.post("/api/admin/kill-switch", headers=h, json={"active": False})).json()["active"] is False


async def test_user_limit_per_plan(client, db):
    h, tid = await register_and_login(client, email="owner@limit.test", company="Limit GmbH")
    # Testphase: 1 Nutzer → Einladung abgelehnt
    assert (await client.post("/api/tenant/members/invite", headers=h, json={"email": "x@limit.test", "role": "member"})).status_code == 403
