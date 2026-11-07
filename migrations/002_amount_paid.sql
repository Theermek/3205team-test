-- Сколько клиент фактически заплатил (amountPaid внешнего API), в копейках.
-- NULL — внешний API не прислал amountPaid (заказы до появления скидок): считаем, что скидки нет.
ALTER TABLE orders ADD COLUMN amount_paid_kop BIGINT;
