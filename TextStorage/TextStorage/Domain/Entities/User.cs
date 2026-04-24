using System;

namespace TextStorage.Domain.Entities
{
	public class User
	{
		public int ID { get; set; }
		public string Username { get; set; }
		public string Email { get; set; }
		public byte[] PasswordHash { get; set; }
		public byte[] PasswordSalt { get; set; }
		public byte[] PrivateKey { get; set; }
		public DateTime CreatedOn { get; set; }
	}
}
