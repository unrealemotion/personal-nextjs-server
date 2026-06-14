export async function resolveHostnameIp(urlStr: string): Promise<string | null> {
    try {
        const urlObj = new URL(urlStr);
        const hostname = urlObj.hostname;
        if (/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(hostname) || hostname === "localhost" || hostname.endsWith(".local")) {
            return null;
        }
        const dnsUrl = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(hostname)}&type=A`;
        const res = await fetch(dnsUrl, {
            headers: { "accept": "application/dns-json" }
        });
        if (res.ok) {
            const dnsData = await res.json();
            if (dnsData.Answer && dnsData.Answer.length > 0) {
                const aRecord = dnsData.Answer.find((ans: any) => ans.type === 1);
                if (aRecord) {
                    return aRecord.data;
                }
            }
        }
    } catch {
        // silence
    }
    return null;
}

export function getHostname(urlStr: string): string {
    let url = urlStr.trim();
    if (!/^https?:\/\//i.test(url)) {
        url = "http://" + url;
    }
    try {
        const parsed = new URL(url);
        return parsed.hostname;
    } catch {
        return "*";
    }
}

