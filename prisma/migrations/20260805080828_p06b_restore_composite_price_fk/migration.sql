-- DropForeignKey
ALTER TABLE "registrations" DROP CONSTRAINT "registrations_price_version_id_fkey";

-- AddForeignKey
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_price_version_id_package_id_fkey" FOREIGN KEY ("price_version_id", "package_id") REFERENCES "price_versions"("id", "package_id") ON DELETE RESTRICT ON UPDATE CASCADE;
