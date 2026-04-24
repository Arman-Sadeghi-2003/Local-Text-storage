using Avalonia.Controls;
using Avalonia.Controls.Notifications;
using Avalonia.Media;
using Avalonia.Threading;
using System;
using TextStorage.Domain.Enums;

namespace TextStorage.Tools.HelperFunctions
{
	public class NotificationManager
	{
		private NotificationManager()
		{ }

		public static NotificationManager Instance { get; } = new NotificationManager();

		// Store the WindowNotificationManager instance
		private WindowNotificationManager? _windowNotificationManager;

		#region Methods

		/// <summary>
		/// Initialize the notification manager with the TopLevel window.
		/// Call this once the MainWindow is loaded.
		/// </summary>
		public void Initialize(TopLevel topLevel)
		{
			if (_windowNotificationManager == null)
			{
				_windowNotificationManager = new WindowNotificationManager(topLevel)
				{
					Position = NotificationPosition.BottomRight,
					MaxItems = 5
				};
				_windowNotificationManager.Foreground = new SolidColorBrush(Colors.White);
			}
		}

		public void ShowSuccessMessage(string title, string message, NotificationDurations duration = NotificationDurations.Short)
			=> generateNotification(title, message, (byte)duration, NotificationType.Success);

		public void ShowWarningMessage(string title, string message, NotificationDurations duration = NotificationDurations.Long)
			=> generateNotification(title, message, (byte)duration, NotificationType.Warning);

		public void ShowExceptionMessage(string title, string exMessage, NotificationDurations duration = NotificationDurations.Long)
			=> generateNotification(title, exMessage, (byte)duration, NotificationType.Error, isException: true);

		/// <summary>
		/// Generates and displays a notification with the specified parameters.
		/// </summary>
		private void generateNotification(string title, string message, byte seconds, NotificationType type, bool isException = false)
		{
			if (_windowNotificationManager == null)
			{
				// Fallback: try to initialize if not done yet
				if (App.MainTopLevel != null)
				{
					Initialize(App.MainTopLevel);
				}
				else
				{
					// Cannot show notification if manager is not initialized
					return;
				}
			}

			var notification = new Notification(title, message, type, TimeSpan.FromSeconds(seconds));

			if (isException)
			{
				notification.OnClick = () =>
				{
					// Your log path logic here
				};
			}

			ShowNotification(notification);
		}

		/// <summary>
		/// Displays the specified notification.
		/// </summary>
		private void ShowNotification(Notification notification)
		{
			// Must run on UI thread
			Dispatcher.UIThread.Post(() =>
			{
				_windowNotificationManager?.Show(notification);
			});
		}

		#endregion Methods
	}
}
