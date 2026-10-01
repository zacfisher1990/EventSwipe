// Release builds: make debug logging a no-op. console.log still crosses into
// native logging in production, and the event pipeline logs a lot.
// console.warn / console.error are left alone.
if (!__DEV__) {
  const noop = () => {};
  console.log = noop;
  console.info = noop;
  console.debug = noop;
}
