-- Real Razorpay gateway support alongside the mock sandbox gateway
ALTER TABLE "payments" ADD COLUMN "gateway" TEXT NOT NULL DEFAULT 'MOCK';
ALTER TABLE "payments" ADD COLUMN "gatewayOrderId" TEXT;
ALTER TABLE "payments" ADD COLUMN "gatewayAmount" DECIMAL(10,2);
CREATE UNIQUE INDEX "payments_gatewayOrderId_key" ON "payments"("gatewayOrderId");
