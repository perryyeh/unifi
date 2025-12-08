
(async () => {
    let csrfToken = "";
    const host = location.hostname;

    // ========== 1. 提取token ==========
    const urltoken = `https://${host}/api/users/self`; // 保持你当前路径
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
        console.error("❌ token请求失败：", e);
        return;
    }

    // ========== 2. 提取合法 MAC 地址（通过 API 查询 clients/history） ==========
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
        // 型号片段允许出现在 display_name 任意位置，覆盖 ADA-AL00U / ALT-AL10E / ALN-AL00 0a:9c 等
        const modelInTextRegex = /\b[A-Z]{3}-[A-Z0-9]{4,6}\b/i;
        // 苹果项目前缀（排除） 例如 ye-iPhone16、xx-iPad12
        const appleLikeRegex = /\b\w*-?i(phone|pad|pod)[0-9]*\b/i;

        macs = list
            .filter(it => {
                const dn = String(it.display_name || "").trim();
                // ② 包含苹果样式名称 → 排除
                if (appleLikeRegex.test(dn)) return false;
                return macRegex.test(dn) || modelInTextRegex.test(dn);
            })
            .map(it => String(it.mac || it.id || "").toLowerCase())
            .filter(m => macRegex.test(m));

        macs = Array.from(new Set(macs));

        if (macs.length === 0) {
            console.warn("⚠️ API 返回成功，但未匹配到需要清理的设备。");
            return;
        }
        console.log("✅ 即将删除以下设备：", macs);
    } catch (e) {
        console.error("❌ 提取合法 MAC 地址失败：", e);
        return;
    }

    // ========== 3. 构建并发起删除请求 ==========
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