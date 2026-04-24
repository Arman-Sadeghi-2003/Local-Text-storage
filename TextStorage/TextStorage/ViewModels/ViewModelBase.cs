using CommunityToolkit.Mvvm.ComponentModel;

namespace TextStorage.ViewModels;

public class ViewModelBase : ObservableObject
{
	public static T GenerateNewInstance<T>() where T : ViewModelBase
	{
		return App.GetViewModel<T>();
	}
}
