type JsonValue = unknown

const getRaw = (key: string): string | null => {
    try {
        return localStorage.getItem(key)
    } catch {
        return null
    }
}

const setRaw = (key: string, value: string): void => {
    try {
        localStorage.setItem(key, value)
    } catch {
        // ignore quota or privacy mode
    }
}

export const storage = {
    get<T = JsonValue>(key: string): T | undefined {
        const raw = getRaw(key)
        if (!raw) return undefined
        try {
            return JSON.parse(raw) as T
        } catch {
            return undefined
        }
    },
    set<T = JsonValue>(key: string, value: T): void {
        try {
            setRaw(key, JSON.stringify(value))
        } catch {
            // ignore
        }
    },
    remove(key: string): void {
        try {
            localStorage.removeItem(key)
        } catch {
            // ignore
        }
    },
}
