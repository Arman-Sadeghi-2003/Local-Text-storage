using System;

namespace TextStorage.Domain.Entities
{
	public class Document
	{
		public int ID { get; set; }
		public string Name { get; set; }
		public string Description { get; set; }
		public string FilePath { get; set; }
		public DateTime CreatedOn { get; set; }
		public DateTime? EditedOn { get; set; }
		public DateTime? DeletedOn { get; set; }
		public bool IsDeleted { get; set; }
		public int DocumentTypeID { get; set; }
		public int BelongsTo { get; set; }
	}
}
