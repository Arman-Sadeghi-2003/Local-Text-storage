using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Serilog;
using System;
using System.IO;
using System.Linq;
using TextStorage.Data.Contexts;
using TextStorage.ViewModels;

namespace TextStorage.Tools.Extensions
{
	public static class ServiceCollectionExtensions
	{
		public static void AddCommonServices(this IServiceCollection collection)
		{
			// add db context
			collection.AddDbContext<TextStorageDBContext>((options =>
			{
				options.UseSqlServer(@"Data Source=(localdb)\MSSQLLocalDB;Initial Catalog=TextStorage;Integrated Security=True;Persist Security Info=False;
									   Pooling=False;MultipleActiveResultSets=False;Encrypt=True;TrustServerCertificate=False;Command Timeout=0");
			}), ServiceLifetime.Singleton);

			// Configure logging using Serilog
			var logFilePath = "L:\\Local text storage\\Database\\Logs";

			Log.Logger = new LoggerConfiguration()
			//.MinimumLevel.Debug()
			.MinimumLevel.Information()
			.Filter.ByIncludingOnly(logEvent => logEvent.Level == Serilog.Events.LogEventLevel.Information || logEvent.Level == Serilog.Events.LogEventLevel.Error)
			.WriteTo.Console()
			.WriteTo.File(logFilePath + "\\app.log", rollingInterval: RollingInterval.Day)
			.CreateLogger();

			CleanOldLogs(logFilePath, TimeSpan.FromDays(60));

			// Use Serilog in logging pipeline
			collection.AddLogging(loggingBuilder =>
			{
				loggingBuilder.ClearProviders();
				loggingBuilder.AddSerilog(); // <--- You need the Serilog.Extensions.Logging package and using
			});

			#region ViewModels

			collection.AddTransient<MainViewModel>();

			#endregion
		}

		private static void CleanOldLogs(string directory, TimeSpan maxAge)
		{
			try
			{
				var oldFiles = Directory.GetFiles(directory)
					.Where(file =>
					{
						var creation = File.GetCreationTime(file);
						return DateTime.Now - creation > maxAge;
					});

				foreach (var file in oldFiles)
				{
					File.Delete(file);
				}
			}
			catch
			{
				// Ignore cleanup errors
			}
		}
	}
}
