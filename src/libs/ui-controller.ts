export type UiInitialState = {
    mutationRate: number
    numberOfCars: number
    neurons: number[]
}

export type UiCallbacks = {
    onChangeMutationRate: (value: number) => void
    onChangeNumberOfCars: (value: number) => void
    onChangeNeurons: (neurons: number[]) => void
    onBackup: () => void
    onRestore: () => void
    onReset: () => void
    onRestart: () => void
    onEvolve: () => void
}

export function bindUI(params: {
    signal: AbortSignal
    initial: UiInitialState
    callbacks: UiCallbacks
}) {
    const { signal, initial, callbacks } = params

    const mutationRange = document.querySelector('#mutation-rate') as HTMLInputElement | null
    const numberOfCarsRange = document.querySelector('#number-of-cars') as HTMLInputElement | null
    const mutationValue = document.querySelector('#mutation-rate-value') as HTMLSpanElement | null
    const numberOfCarsValue = document.querySelector(
        '#number-of-cars-value',
    ) as HTMLSpanElement | null
    const neuronsInput = document.querySelector('#neurons') as HTMLInputElement | null

    // Initialize values
    if (mutationValue) mutationValue.innerText = `${Math.round(initial.mutationRate * 100)}%`
    if (mutationRange) mutationRange.value = `${initial.mutationRate * 100}`
    if (numberOfCarsValue) numberOfCarsValue.innerText = String(initial.numberOfCars)
    if (numberOfCarsRange) numberOfCarsRange.value = `${initial.numberOfCars}`
    if (neuronsInput) neuronsInput.value = initial.neurons.join(',')

    // Helpers
    const on = (
        target: EventTarget | null,
        type: string,
        handler: EventListenerOrEventListenerObject,
        options?: AddEventListenerOptions,
    ) => target?.addEventListener(type, handler, { ...(options ?? {}), signal })

    // Events
    on(neuronsInput, 'keypress', (event: Event) => {
        const e = event as KeyboardEvent
        if (e.key !== 'Enter' || !neuronsInput) return
        const values = neuronsInput.value
            .split(',')
            .map((v) => Number(v))
            .filter((n) => Number.isFinite(n))
        callbacks.onChangeNeurons(values)
    })

    on(mutationRange, 'input', () => {
        if (!mutationRange || !mutationValue) return
        const value = Number(mutationRange.value)
        mutationValue.innerText = `${value}%`
        callbacks.onChangeMutationRate(value / 100)
    })

    on(numberOfCarsRange, 'input', () => {
        if (!numberOfCarsRange || !numberOfCarsValue) return
        numberOfCarsValue.innerText = numberOfCarsRange.value
        callbacks.onChangeNumberOfCars(Number(numberOfCarsRange.value))
    })

    on(document.querySelector('#save-network'), 'click', () => callbacks.onBackup())
    on(document.querySelector('#restore-network'), 'click', () => callbacks.onRestore())
    on(document.querySelector('#reset-network'), 'click', () => callbacks.onReset())
    on(document.querySelector('#restart-network'), 'click', () => callbacks.onRestart())
    on(document.querySelector('#evolve-network'), 'click', () => callbacks.onEvolve())
}
