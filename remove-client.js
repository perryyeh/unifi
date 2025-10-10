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
    

    // ========== 2. 提取合法 MAC 地址 ==========
    const macRegex = /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i;
    const rows = document.querySelectorAll("table tbody tr");

    const macs = Array.from(rows)
        .map(row => {
            const span = row.querySelector("td:nth-child(2) span");
            return span ? span.textContent.trim() : "";
        })
        .filter(mac => macRegex.test(mac));

    if (macs.length === 0) {
        console.warn("⚠️ 未找到合法的 MAC 地址");
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