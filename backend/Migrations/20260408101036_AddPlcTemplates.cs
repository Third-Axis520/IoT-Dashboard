using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace IoT.CentralApi.Migrations
{
    /// <inheritdoc />
    public partial class AddPlcTemplates : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // 實際建表由 Program.cs 的 IF NOT EXISTS SQL 負責（與 AddRegisterMap 相同模式）
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
        }
    }
}
