using Avalonia.Controls;
using Avalonia.Controls.Templates;
using System;
using System.Collections.Generic;
using TextStorage.ViewModels;

namespace TextStorage
{
	internal class ViewLocator : IDataTemplate
	{
		private readonly Dictionary<Type, Func<Control?>> _locator = new();

		public ViewLocator()
		{
		}

		public Control? Build(object? data)
		{
			if (data is null)
				return null;

			var name = data.GetType().FullName!.Replace("ViewModel", "View", StringComparison.Ordinal);
			try
			{
				var type = Type.GetType(name);

				if (type != null)
				{
					return (Control)Activator.CreateInstance(type)!;
				}

				return new TextBlock { Text = "Not Found: " + name };
			}
			catch (StackOverflowException sofx)
			{
				return new TextBlock { Text = "Not Found: " + name };
			}
			catch (Exception ex)
			{
				return new TextBlock { Text = "Not Found: " + name };
			}
		}

		public bool Match(object? data)
		{
			return data is ViewModelBase;
		}
	}
}