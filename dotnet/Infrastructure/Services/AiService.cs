using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Configuration;
using OneLineArt.Core.DTOs;
using OneLineArt.Core.Interfaces;

namespace OneLineArt.Infrastructure.Services;

public class AiService : IAiService
{
    private readonly IRateLimitRepository _rateLimit;
    private readonly IConfiguration _config;
    private readonly HttpClient _http;

    public AiService(IRateLimitRepository rateLimit, IConfiguration config, IHttpClientFactory httpFactory)
    {
        _rateLimit = rateLimit;
        _config = config;
        _http = httpFactory.CreateClient();
    }

    public async Task<AiImageResponse> GenerateImageAsync(Guid userId, string prompt)
    {
        var apiKey = _config["OpenAI:ApiKey"];
        if (string.IsNullOrEmpty(apiKey))
            return new AiImageResponse(false, Error: "OpenAI is not configured on the server");

        if (string.IsNullOrWhiteSpace(prompt))
            return new AiImageResponse(false, Error: "Prompt is required");

        // Rate limiting: 1 request per 5 seconds
        var allowed = await _rateLimit.CheckAndUpdateAsync(userId, "ai-image", 5000);
        if (!allowed)
            return new AiImageResponse(false, Error: "Please wait a few seconds between image generations");

        var styledPrompt = $"A minimalist one-line drawing, single continuous black line on pure white background, simple elegant line art of: {prompt.Trim()}";

        var requestBody = JsonSerializer.Serialize(new
        {
            model = "dall-e-3",
            prompt = styledPrompt,
            n = 1,
            size = "1024x1024",
            quality = "hd",
            response_format = "b64_json"
        });

        var httpReq = new HttpRequestMessage(HttpMethod.Post, "https://api.openai.com/v1/images/generations")
        {
            Content = new StringContent(requestBody, Encoding.UTF8, "application/json"),
            Headers = { { "Authorization", $"Bearer {apiKey}" } }
        };

        var res = await _http.SendAsync(httpReq);
        var json = await res.Content.ReadAsStringAsync();

        if (!res.IsSuccessStatusCode)
        {
            try
            {
                var errObj = JsonSerializer.Deserialize<JsonElement>(json);
                var msg = errObj.GetProperty("error").GetProperty("message").GetString();
                return new AiImageResponse(false, Error: msg);
            }
            catch
            {
                return new AiImageResponse(false, Error: $"OpenAI API error: {res.StatusCode}");
            }
        }

        var data = JsonSerializer.Deserialize<JsonElement>(json);
        var b64 = data.GetProperty("data")[0].GetProperty("b64_json").GetString();

        return new AiImageResponse(true, B64Json: b64);
    }
}
