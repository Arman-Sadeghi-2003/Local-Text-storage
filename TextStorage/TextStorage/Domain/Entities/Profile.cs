using System;

namespace TextStorage.Domain.Entities
{
	public class Profile
	{
		public int ID { get; set; }
		public string FirstName { get; set; }
		public string LastName { get; set; }
		public string Avatar { get; set; }
		public DateTime? EditedOn { get; set; }
		public int UserID { get; set; }
	}
}
