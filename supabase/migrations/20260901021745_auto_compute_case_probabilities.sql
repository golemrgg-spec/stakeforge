-- Auto-compute case item probabilities so EV = 0.90 * case_price
-- Uses inverse-value weighting: P(item) ∝ 1/value, then normalizes to target EV

DO $$
DECLARE
  v_case record;
  v_item record;
  v_total_weight double precision;
  v_target_ev double precision;
  v_scale double precision;
  v_ev double precision;
  v_sum_prob double precision;
BEGIN
  FOR v_case IN SELECT id, price FROM case_catalog LOOP
    v_target_ev := v_case.price * 0.90;
    
    -- Step 1: Compute raw weights = 1/value (cheaper items get higher weight)
    v_total_weight := 0;
    FOR v_item IN SELECT id, value FROM case_items WHERE case_id = v_case.id LOOP
      v_total_weight := v_total_weight + (1.0 / v_item.value);
    END LOOP;
    
    -- Step 2: Set probability = (1/value) / total_weight, then scale so EV = target
    -- EV = SUM(value * prob) = SUM(value * (1/value) / total_weight * scale) = SUM(1) / total_weight * scale = count / total_weight * scale
    -- We want EV = target, so scale = target * total_weight / count
    SELECT COUNT(*)::double precision INTO v_scale FROM case_items WHERE case_id = v_case.id;
    v_scale := v_target_ev * v_total_weight / v_scale;
    
    -- Step 3: Apply probabilities
    v_sum_prob := 0;
    FOR v_item IN SELECT id, value FROM case_items WHERE case_id = v_case.id LOOP
      v_sum_prob := v_sum_prob + (v_scale / v_item.value);
      UPDATE case_items SET probability = (v_scale / v_item.value) WHERE id = v_item.id;
    END LOOP;
    
    -- Verify: probabilities should sum to ~1.0
    -- If not exactly 1.0, adjust the last item
    IF v_sum_prob > 0 THEN
      UPDATE case_items SET probability = probability + (1.0 - v_sum_prob)
      WHERE id = (SELECT id FROM case_items WHERE case_id = v_case.id ORDER BY value DESC LIMIT 1);
    END IF;
    
  END LOOP;
END $$;
