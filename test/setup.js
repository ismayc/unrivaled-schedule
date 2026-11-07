import '@testing-library/jest-dom/vitest'

// jsdom implements no layout, so the schedule's landing scroll has nothing to call.
// A no-op keeps every render path reachable; the scroll target itself is asserted in
// the tests that care about it.
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {}
if (!window.scrollTo || String(window.scrollTo).includes('Not implemented')) window.scrollTo = () => {}
