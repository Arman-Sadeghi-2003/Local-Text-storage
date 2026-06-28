using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.ApplicationLifetimes;
using Avalonia.Input.Platform;
using Avalonia.Markup.Xaml;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Serilog;
using System;
using System.Linq;
using TextStorage.Tools.Extensions;
using TextStorage.Tools.HelperFunctions;
using TextStorage.ViewModels;
using TextStorage.Views;

namespace TextStorage;

public partial class App : Application
{
	#region Helpers

	private static ServiceProvider? provider;

	public static T GetViewModel<T>() where T : ViewModelBase
	{
		return provider?.GetServices<T>().FirstOrDefault() ?? throw new InvalidOperationException($"ViewModel of type {typeof(T).Name} not found.");
	}

	public static ILogger<T>? GetLogger<T>()
	{
		return provider?.GetServices<ILogger<T>>().FirstOrDefault();
	}

	//public static ILogger? GetLogger()
	//{
	//	return provider?.GetServices<ILogger>().FirstOrDefault();
	//}

	public static TopLevel? MainTopLevel { get; set; }

	public static void CopyText(string text)
	{
		//var logger = GetLogger();
		try
		{
			var clipboard = MainTopLevel?.Clipboard;
			clipboard?.SetTextAsync(text).ContinueWith(task =>
			{
				if (task.IsFaulted)
				{
					var msg = "There are some issues on copy";
					//logger?.LogError(task.Exception, msg);
					NotificationManager.Instance.ShowExceptionMessage("Caution", msg);
				}
				else if (task.IsCompleted)
				{
					var msg = "Content copied successfully";
					NotificationManager.Instance.ShowWarningMessage("Copy", msg);
				}
			});
		}
		catch (Exception ex)
		{
			var msg = "An error occurred" + ex.Message;
			//logger?.LogError(ex, msg);
			NotificationManager.Instance.ShowExceptionMessage("Error", msg);
		}
	}

	#endregion

	public override void Initialize()
	{
		Log.Information("init");
		AvaloniaXamlLoader.Load(this);
	}

	public override async void OnFrameworkInitializationCompleted()
	{

		// Line below is needed to remove Avalonia data validation.
		// Without this line you will get duplicate validations from both Avalonia and CT
		//BindingPlugins.DataValidators.RemoveAt(0);

		var locator = new ViewLocator();
		DataTemplates.Add(locator);

		// Setup Dependency Injection
		var services = new ServiceCollection();
		services.AddCommonServices();

		provider = services.BuildServiceProvider();

		var mainvm = MainViewModel.GenerateNewInstance();

		if (ApplicationLifetime is IClassicDesktopStyleApplicationLifetime desktop)
		{
			desktop.MainWindow = new MainWindow
			{
				DataContext = mainvm
			};

			// Initialize notification manager AFTER window is created
			desktop.MainWindow.Loaded += (sender, args) =>
			{
				MainTopLevel = TopLevel.GetTopLevel(desktop.MainWindow);
				if (MainTopLevel != null)
				{
					NotificationManager.Instance.Initialize(MainTopLevel);
				}
			};
		}
		else if (ApplicationLifetime is ISingleViewApplicationLifetime singleViewPlatform)
		{
			singleViewPlatform.MainView = new MainView
			{
				DataContext = mainvm
			};

			// Initialize notification manager AFTER view is loaded
			singleViewPlatform.MainView.Loaded += (sender, args) =>
			{
				MainTopLevel = TopLevel.GetTopLevel(singleViewPlatform.MainView);
				if (MainTopLevel != null)
				{
					NotificationManager.Instance.Initialize(MainTopLevel);
				}
			};
		}

		base.OnFrameworkInitializationCompleted();
	}
}
