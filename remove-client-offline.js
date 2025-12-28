(async () => {
    let csrfToken = "";
    const host = location.hostname;

    // ========== 1. 提取 token ==========
    const urltoken = `https://${host}/api/users/self`;
    try {
        const res = await fetch(urltoken, {
            method: "GET",
            credentials: "include",
            headers: {
                "Accept": "application/json, text/plain, */*",
                "DNT": "1"
            }
        });

        const v = res.headers.get("X-Csrf-Token");
        if (v) csrfToken = v;
        console.log("✅ CSRF token：", csrfToken);
    } catch (e) {
        console.error("❌ token 请求失败：", e);
        return;
    }

    // ========== 2. 提取 offline 设备的 MAC ==========
    let macs = [];
    try {
        const api = `https://${host}/proxy/network/v2/api/site/default/clients/history?onlyNonBlocked=true&includeUnifiDevices=true&withinHours=0`;

        const res = await fetch(api, {
            method: "GET",
            credentials: "include",
            headers: {
                "Accept": "application/json, text/plain, */*",
                "DNT": "1",
                "X-Csrf-Token": csrfToken
            }
        });

        const payload = await res.json();
        const list = Array.isArray(payload) ? payload : (payload?.data ?? []);

        const macRegex = /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i;

        macs = list
            .filter(it => {
                // ✅ 新逻辑：只处理 offline 的
                return it.status === "offline";
            })
            .map(it => String(it.mac || it.id || "").toLowerCase())
            .filter(m => macRegex.test(m));

        macs = Array.from(new Set(macs));

        if (macs.length === 0) {
            console.warn("⚠️ 未找到 status=offline 的设备，无需清理。");
            return;
        }
        console.log("✅ 即将删除以下 offline 设备：", macs);
    } catch (e) {
        console.error("❌ 提取 MAC 失败：", e);
        return;
    }

    // ========== 3. 发起删除请求 ==========
    const url = `https://${host}/proxy/network/api/s/default/cmd/stamgr`;
    try {
        const res = await fetch(url, {
            method: "POST",
            credentials: "include",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json, text/plain, */*",
                "X-Csrf-Token": csrfToken,
                "Origin": `https://${host}`,
                "DNT": "1"
            },
            body: JSON.stringify({
                macs: macs,
                cmd: "forget-sta"
            })
        });

        const result = await res.json();
        console.log("✅ 删除请求完成，返回：", result);
    } catch (e) {
        console.error("❌ 删除请求失败：", e);
    }
})();