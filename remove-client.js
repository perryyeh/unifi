var script = document.createElement('script');
script.src = 'https://code.jquery.com/jquery-3.6.0.min.js';
document.head.appendChild(script);

(async () => {

    let csrfToken = "";

    const host = location.hostname;

    // ========== 1. 提取token ==========
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

        const v = res.headers.get('X-Csrf-Token');
        if (v) {
            csrfToken = v;
        } 
        console.log("✅ CSRF token：", csrfToken);


    } catch (e) {
        console.error("❌ token请求失败：", e);
        return;
    }
    

    // ========== 2. 提取合法 MAC 地址（通过 API 查询 clients/history） ==========
    let macs = []
    try {
        const api = `https://${host}/proxy/network/v2/api/site/default/clients/history?onlyNonBlocked=true&includeUnifiDevices=true&withinHours=0`;

        const res = await fetch(api, {
            method: "GET",
            credentials: "include",
            headers: {
                "Accept": "application/json, text/plain, */*",
                "DNT": "1",
                // 一些部署需要携带 CSRF 头才能通过反向代理校验；没有也无妨
                "X-Csrf-Token": csrfToken
            }
        });

        const payload = await res.json();
        const list = Array.isArray(payload) ? payload : (payload?.data ?? []);

        // 规则：
        // 1) display_name 是纯 MAC
        // 2) display_name 匹配「三字母-四位字母数字」（如 ADA-AL00 / OCE-AN10 等）
        //    不管 display_name 里是否再跟了“ 0a:9c”之类的后缀
        const macRegex = /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i;
        const modelRegex = /\b[A-Z]{3}-[A-Z0-9]{4,6}\b/i;

        macs = list
            .filter(it => {
                const dn = String(it.display_name || "").trim();
                return macRegex.test(dn) || modelRegex.test(dn);
            })
            // 从同一对象提取真正要删除的 MAC（字段 mac；兜底用 id）
            .map(it => String(it.mac || it.id || "").toLowerCase())
            .filter(m => macRegex.test(m));

        // 去重
        macs = Array.from(new Set(macs));

        if (macs.length === 0) {
            console.warn("⚠️ API 返回成功，但未匹配到需要清理的设备。");
            return;
        }

        console.log("✅ 即将删除以下设备：", macs);

        // ===== 下面继续沿用你现有的“第 3 段：构建并发起删除请求”即可 =====

    } catch (e) {
        console.error("❌ 提取合法 MAC 地址失败：", e);
        return;
    }

    console.log("✅ 即将删除以下设备：", macs);

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