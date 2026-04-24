using Microsoft.EntityFrameworkCore;
using TextStorage.Domain.Entities;

namespace TextStorage.Data.Contexts
{
	public class TextStorageDBContext : DbContext
	{
		public TextStorageDBContext(DbContextOptions<TextStorageDBContext> options)
		: base(options) { }

		#region DB sets

		public DbSet<AccountSetting> AccountSettings { get; set; }
		public DbSet<Document> Documents { get; set; }
		public DbSet<DocumentType> DocumentTypes { get; set; }
		public DbSet<Profile> Profiles { get; set; }
		public DbSet<User> Users { get; set; }

		#endregion DB sets
	}
}