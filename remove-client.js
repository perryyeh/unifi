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

    // ========== 2. 同时提取 history + active clients ==========
    let macs = [];
    try {
        const historyApi = `https://${host}/proxy/network/v2/api/site/default/clients/history?onlyNonBlocked=true&includeUnifiDevices=true&withinHours=0`;
        const activeApi = `https://${host}/proxy/network/v2/api/site/default/clients/active?includeTrafficUsage=true&includeUnifiDevices=true`;

        const commonHeaders = {
            "Accept": "application/json, text/plain, */*",
            "DNT": "1",
            "X-Csrf-Token": csrfToken
        };

        const [historyRes, activeRes] = await Promise.all([
            fetch(historyApi, {
                method: "GET",
                credentials: "include",
                headers: commonHeaders
            }),
            fetch(activeApi, {
                method: "GET",
                credentials: "include",
                headers: commonHeaders
            })
        ]);

        const historyPayload = await historyRes.json();
        const activePayload = await activeRes.json();

        const historyList = Array.isArray(historyPayload) ? historyPayload : (historyPayload?.data ?? []);
        const activeList = Array.isArray(activePayload) ? activePayload : (activePayload?.data ?? []);

        const list = [...historyList, ...activeList];

        const macRegex = /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i;
        const modelInTextRegex = /\b[A-Z]{3}-[A-Z0-9]{4,6}\b/i;
        const appleLikeRegex = /\b\w*-?i(phone|pad|pod)[0-9]*\b/i;

        macs = list
            .filter(it => {
                const dn = String(it.display_name || it.name || it.hostname || "").trim();

                // 排除苹果风格命名
                if (appleLikeRegex.test(dn)) return false;

                // 保留 display_name/name/hostname 中像 MAC 或型号串的设备
                return macRegex.test(dn) || modelInTextRegex.test(dn);
            })
            .map(it => String(it.mac || it.id || "").toLowerCase())
            .filter(m => macRegex.test(m));

        macs = Array.from(new Set(macs));

        if (macs.length === 0) {
            console.warn("⚠️ history + active 都查了，但未匹配到需要清理的设备。");
            return;
        }

        console.log("✅ 即将删除以下设备：", macs);
    } catch (e) {
        console.error("❌ 提取合法 MAC 地址失败：", e);
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