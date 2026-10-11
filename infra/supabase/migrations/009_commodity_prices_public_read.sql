create policy "commodity_prices_public_read" on public.commodity_prices for select to anon, authenticated using (true);
