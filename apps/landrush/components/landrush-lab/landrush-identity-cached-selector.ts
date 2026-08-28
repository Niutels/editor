export function createLandrushIdentityCachedSelector<State, Input, Output>({
  derive,
  equals = Object.is,
  selectInput,
}: {
  derive: (input: Input) => Output
  equals?: (previous: Output, next: Output) => boolean
  selectInput: (state: State) => Input
}) {
  let hasInput = false
  let hasOutput = false
  let previousInput: Input
  let previousOutput: Output

  return (state: State) => {
    const input = selectInput(state)
    if (hasInput && Object.is(previousInput, input)) return previousOutput

    const nextOutput = derive(input)
    previousInput = input
    hasInput = true
    if (hasOutput && equals(previousOutput, nextOutput)) return previousOutput

    previousOutput = nextOutput
    hasOutput = true
    return nextOutput
  }
}
