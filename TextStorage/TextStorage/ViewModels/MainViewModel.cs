namespace TextStorage.ViewModels;

public partial class MainViewModel : ViewModelBase
{
	public string Greeting => "Welcome to Avalonia!";

	public static MainViewModel GenerateNewInstance()
	{
		return GenerateNewInstance<MainViewModel>();
	}
}
