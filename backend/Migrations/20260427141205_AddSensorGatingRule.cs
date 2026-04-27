using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace IoT.CentralApi.Migrations
{
    /// <inheritdoc />
    public partial class AddSensorGatingRule : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "SensorGatingRules",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    GatedAssetCode = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    GatedSensorId = table.Column<int>(type: "int", nullable: false),
                    GatingAssetCode = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    GatingSensorId = table.Column<int>(type: "int", nullable: false),
                    DelayMs = table.Column<int>(type: "int", nullable: false),
                    MaxAgeMs = table.Column<int>(type: "int", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SensorGatingRules", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_SensorGatingRules_GatedAssetCode_GatedSensorId",
                table: "SensorGatingRules",
                columns: new[] { "GatedAssetCode", "GatedSensorId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SensorGatingRules_GatingAssetCode_GatingSensorId",
                table: "SensorGatingRules",
                columns: new[] { "GatingAssetCode", "GatingSensorId" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "SensorGatingRules");
        }
    }
}
