/** Bench's own tests never touch the on-disk cache: a test that read a value
 *  cached by a previous run would be testing the previous run. */
process.env.BENCH_NO_CACHE = '1';
